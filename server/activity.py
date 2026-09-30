"""Private, bounded job history. Never expose filesystem paths or helper manifests."""
from common import query

BACKUP_FIELDS = 'id,status,trigger,total,completed,failed,files_done,bytes_done,current_item,message,created_at,updated_at,next_run_at,started_at,finished_at,elapsed_seconds,duration_known'


def history(params):
    offset = max(0,int(params.get('offset',['0'])[0]))
    kind = params.get('kind',['all'])[0]
    if kind not in ('all','fetch','nas'): raise ValueError('Activity type')
    rows = query('''SELECT * FROM (
        SELECT id,'fetch' AS kind,status,trigger,total,completed,failed,message,created_at,updated_at,
               NULL::timestamptz AS started_at,NULL::timestamptz AS finished_at,
               NULL::double precision AS elapsed_seconds,false AS duration_known
        FROM jobs
        UNION ALL
        SELECT id,'nas' AS kind,status,trigger,total,completed,failed,message,created_at,updated_at,
               started_at,finished_at,elapsed_seconds,duration_known FROM backup_jobs
        ) activity WHERE (%s='all' OR kind=%s)
        ORDER BY created_at DESC,kind,id LIMIT 51 OFFSET %s''',(kind,kind,offset))
    return {'items':rows[:50],'hasMore':len(rows)>50}
