"""Allowlisted diagnostics only; never retain raw tool stderr, URLs or credentials."""
import re

CODES = {'MOVIE_TYPE_UNSUPPORTED','VIDEO_ID_INVALID','VIDEO_ID_MISSING','HTTPS_REQUIRED','MEDIA_TOOL_NOT_FOUND',
         'MEDIA_TOOL_FAILED','MEDIA_ACCESS_DENIED','NETWORK_ERROR','TIMEOUT','FILE_IO_ERROR','EMPTY_MEDIA','DOWNLOAD_FAILED'}
STAGES = {'list','details','cover','video','save','download'}


def sanitize(values):
    result=[]
    for value in (values if isinstance(values,list) else [])[:4]:
        if not isinstance(value,dict): continue
        code=value.get('code')
        result.append({'itemId':value.get('itemId') if re.fullmatch(r'[A-Za-z0-9_-]{1,128}',str(value.get('itemId',''))) else 'unknown',
                       'kind':value.get('kind') if value.get('kind') in ('movie','gallery','blog','post') else 'unknown',
                       'stage':value.get('stage') if value.get('stage') in STAGES else 'download',
                       'code':code if isinstance(code,str) and (code in CODES or re.fullmatch(r'HTTP_[1-5]\d\d',code)) else 'DOWNLOAD_FAILED'})
    return result


class DownloadError(RuntimeError):
    def __init__(self, values):
        super().__init__('Download failed')
        self.diagnostics=sanitize(values)


def details(error, item=None):
    item=item or {'id':'list','kind':'unknown'}
    values=getattr(error,'diagnostics',None)
    return sanitize(values or [{'itemId':item['id'],'kind':item['kind'],'stage':'download','code':'DOWNLOAD_FAILED'}])
