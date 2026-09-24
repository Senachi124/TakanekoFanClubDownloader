"""Member-scoped, paginated catalog views. Media paths remain private."""
from common import query

PAGE_SIZE = 48


def collection(params, multimedia=False):
    offset = max(0, int(params.get('offset', ['0'])[0]))
    kind = params.get('type', ['all'])[0]
    if kind not in ('all', 'image', 'video'): raise ValueError('Media type')
    members = [r['member'] for r in query('SELECT DISTINCT member FROM posts ORDER BY member')]
    member = params.get('member', [members[0] if members else ''])[0]
    if multimedia:
        where = """p.member=%s AND m.variant='original' AND m.owner_id='owner'
                   AND m.permission='private' AND m.size>0 AND (m.local_available OR m.nas_available)
                   AND left(m.mime,6) IN ('image/','video/') AND (%s='all' OR split_part(m.mime,'/',1)=%s)"""
        args = (member, kind, kind)
        total = query(f'SELECT count(*) AS total FROM media m JOIN posts p USING(resource_key) WHERE {where}', args, one=True)['total']
        rows = query(f'''SELECT m.media_id,m.mime,m.width,m.height,p.resource_key,p.title,p.member,p.created_at,
                               thumb.media_id AS cover_id
                        FROM media m JOIN posts p USING(resource_key)
                        LEFT JOIN LATERAL (SELECT media_id FROM media t WHERE t.original_id=m.media_id
                          AND t.variant='thumbnail' AND t.owner_id='owner' AND t.permission='private'
                          AND (t.local_available OR t.nas_available) ORDER BY t.media_id LIMIT 1) thumb ON true
                        WHERE {where} ORDER BY p.created_at DESC,p.resource_key,m.relative_path,m.media_id
                        LIMIT %s OFFSET %s''', (*args, PAGE_SIZE + 1, offset))
    else:
        total = query('SELECT count(*) AS total FROM posts WHERE member=%s', (member,), one=True)['total']
        rows = query('''SELECT p.resource_key,p.title,p.member,p.kind,p.created_at,p.nas_available,p.local_available,
                              thumb.media_id AS cover_id
                       FROM posts p LEFT JOIN LATERAL (SELECT media_id FROM media m
                         WHERE m.resource_key=p.resource_key AND m.variant='thumbnail'
                         AND m.owner_id='owner' AND m.permission='private' AND (m.local_available OR m.nas_available)
                         ORDER BY m.relative_path LIMIT 1) thumb ON true
                       WHERE p.member=%s ORDER BY p.created_at DESC,p.resource_key LIMIT %s OFFSET %s''',
                     (member, PAGE_SIZE + 1, offset))
    return {'media' if multimedia else 'posts': rows[:PAGE_SIZE], 'members': members, 'member': member,
            'total': total, 'hasMore': len(rows) > PAGE_SIZE}
