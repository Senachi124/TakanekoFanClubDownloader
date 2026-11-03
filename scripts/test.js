const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
for(const directory of ['test','tests'])for(const name of fs.readdirSync(directory).filter(f=>f.endsWith('.test.js'))){const r=spawnSync(process.execPath,[path.join(directory,name)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
