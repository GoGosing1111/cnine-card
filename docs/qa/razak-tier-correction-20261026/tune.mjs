import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root='docs/qa/razak-tier-correction-20261026',base={version:4,basePower:1000000,actionEnergy:10,motionPlaybackRate:2};
const candidates=[
 ['a',1.25,3,3,1800,1600,800,.25,1.5,2],
 ['b',1.25,3,3,1400,1200,600,.2,1.5,2],
 ['c',1.25,3.12,3.12,1400,1600,800,.2,1.3,1.6],
 ['d',1.25,3,3,1000,1600,800,.2,1,1.5],
 ['e',1.25,3.5,3.5,2000,1000,500,.5,1.5,3.5],
 ['f',1.25,3.5,3.5,2000,1000,500,.4,1.5,3],
 ['g',1.25,4,4,1800,1000,500,.35,1.5,2.5],
 ['h',1.25,4,4,1600,1200,600,.4,1.3,2.5],
 ['i',2.4,4,4,1800,800,400,.35,1.5,2.5],
 ['j',2.4,3.5,3.5,1800,1000,500,.4,1.5,3],
 ['k',2.4,4,4,1600,1000,500,.4,1.3,2.5],
 ['l',2.4,4,4,1400,800,400,.4,1,3]
];
for(const [id,statScale,speedScale,actionCredit,attackPercent,hpPercent,shieldPercent,damageTakenScale,basicCapScale,pvpSkillCapScale]of candidates.slice(Number(process.argv[2]||0))){
 const policy={...base,statScale,speedScale,actionCredit,link:{attackPercent,hpPercent,shieldPercent},damageTakenScale,basicCapScale,pvpSkillCapScale},config=path.resolve(root+'/candidate-'+id+'-policy.json'),out=root+'/candidate-'+id+'.json';
 fs.writeFileSync(config,JSON.stringify(policy,null,2)+'\n',{flag:'wx'});
 execFileSync(process.execPath,['--import',pathToFileURL(path.resolve(root+'/candidate-loader.mjs')).href,'scripts/measure-razak-balance-20261026.mjs','--count','4','--start','120001','--codes','V-990,V-977,V-960,V-961,V-962,V-963,V-964,V-965,V-996,V-999,V-989,V-988,V-987,V-979,V-978,V-976,V-975,V-974,V-973,V-972','--out',out],{encoding:'utf8',windowsHide:true,env:{...process.env,RAZAK_CANDIDATE_FILE:config},maxBuffer:1e6});
 const result=JSON.parse(fs.readFileSync(out));console.log(JSON.stringify({candidate:id,total:result.total,rows:result.rows.map(({code,name,winRate})=>({code,name,winRate}))}));
}
