import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {out} from './common.mjs';
for(const platform of process.argv[2]?[process.argv[2]]:['desktop','android','ios','windows','h5'])for(const phase of ['before','candidate']){
 const r=spawnSync(process.execPath,[path.join(out,'portal.mjs'),phase,platform],{windowsHide:true,encoding:'utf8',maxBuffer:4e6});fs.writeFileSync(path.join(out,'ui-'+platform+'-'+phase+'.log'),r.stdout+'\n'+r.stderr);console.log(JSON.stringify({phase,platform,exit:r.status}));if(r.status!==0)process.exit(r.status||1);
}
