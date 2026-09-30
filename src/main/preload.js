const {contextBridge,ipcRenderer} = require('electron');
const channels = new Set(['get-app-info','get-download-errors','get-download-settings','save-v2-settings','get-login-status','open-login','capture-token','start-download','control-pause','control-resume','control-cancel','open-exported-folder','reader-select','reader-scan','reader-query','reader-detail']);
contextBridge.exposeInMainWorld('takaneko',{
  invoke:(channel,...args)=>{if(!channels.has(channel)) throw new Error('Unknown operation');return ipcRenderer.invoke(channel,...args);},
  onProgress:callback=>ipcRenderer.on('job-progress',(_event,value)=>callback(value))
});
