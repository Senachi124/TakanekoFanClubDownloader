// Only allowlisted codes and source identifiers cross IPC or enter job history.
const CODES = new Set(['MOVIE_TYPE_UNSUPPORTED','VIDEO_ID_INVALID','VIDEO_ID_MISSING','HTTPS_REQUIRED','MEDIA_TOOL_NOT_FOUND','MEDIA_TOOL_FAILED','MEDIA_ACCESS_DENIED','NETWORK_ERROR','TIMEOUT','FILE_IO_ERROR','EMPTY_MEDIA','DOWNLOAD_FAILED']);
const STAGES = new Set(['list','details','cover','video','save','download']);
function failure(code, message=code) { const error=new Error(message);error.code=code;return error; }
function diagnostic(error, item={}, stage='download') {
  const http=String(error?.message || '').match(/\bHTTP (\d{3})\b/);
  const raw=error?.code;
  const code=CODES.has(raw)?raw:http?`HTTP_${http[1]}`:/HTTPS required/.test(error?.message || '')?'HTTPS_REQUIRED':
    ['ETIMEDOUT','ABORT_ERR'].includes(raw)||/timeout/i.test(error?.message || '')?'TIMEOUT':
    ['ENOENT','EACCES','ENOSPC','EIO'].includes(raw)?'FILE_IO_ERROR':/fetch failed|network/i.test(error?.message || '')?'NETWORK_ERROR':'DOWNLOAD_FAILED';
  return {itemId:/^[a-zA-Z0-9_-]{1,128}$/.test(String(item.id))?String(item.id):'unknown',
    kind:['movie','gallery','blog','post'].includes(item.kind)?item.kind:'unknown',stage:STAGES.has(stage)?stage:'download',code};
}
function diagnostics(error,item={},stage='download') {
  if(Array.isArray(error?.diagnostics) && error.diagnostics.length) return error.diagnostics.slice(0,4).map(value=>{
    const code=CODES.has(value.code)||/^HTTP_[1-5]\d\d$/.test(value.code)?value.code:'DOWNLOAD_FAILED';
    return {...diagnostic(null,{id:value.itemId,kind:value.kind},value.stage),code};
  });
  return [diagnostic(error,item,stage)];
}
module.exports={failure,diagnostic,diagnostics};
