import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
const folder='pepegu-roster32-draw10-20261106',root=fileURLToPath(new URL('../../',import.meta.url));
const result=JSON.parse(await fs.readFile(new URL('./result.json',import.meta.url),'utf8'));
assert.equal(result.status,'DRAW_COMPLETED_NOT_GRANTED');assert.equal(result.totalTickets,113);assert.equal(result.grantWrites,0);assert.equal(result.winners.length,10);assert.equal(new Set(result.winners.map(w=>w.userId)).size,10);
// Independently check recorded random values and remaining weighted intervals.
const pool=structuredClone(result.participants);let nextCounter=0;
for(const [i,step] of result.trace.entries()){
 const total=pool.reduce((sum,p)=>sum+p.tickets,0);assert.equal(step.poolTickets,total);let value,digest,counter;
 do{counter=nextCounter++;digest=createHmac('sha256',Buffer.from(result.seedHex,'hex')).update(result.operationKey+'|'+result.requestHash+'|'+counter).digest();value=digest.readUInt32BE(0);}while(value>=Math.floor(4294967296/total)*total);
 assert.equal(step.counter,counter);assert.equal(step.digestHex,digest.toString('hex'));assert.equal(step.randomUint32,value);assert.equal(step.ticketIndexZeroBased,value%total);
 let cursor=0,winnerIndex=-1;for(let j=0;j<pool.length;j++){if(value%total<cursor+pool[j].tickets){winnerIndex=j;break;}cursor+=pool[j].tickets;}
 assert(winnerIndex>=0);const winner=pool.splice(winnerIndex,1)[0];assert.equal(step.winnerUserId,winner.userId);assert.deepEqual(step.winnerTicketRangeZeroBased,[cursor,cursor+winner.tickets-1]);assert.deepEqual(result.winners[i],{rank:i+1,...winner});
}
const evidence=new URL('./evidence/',import.meta.url);await fs.mkdir(evidence,{recursive:true});
const write=(file,data)=>fs.writeFile(new URL(file,evidence),data,{flag:'wx'});
await write('verified.json',JSON.stringify({checkedAt:new Date().toISOString(),traceVerified:10,participants:32,tickets:113,uniqueWinners:10,grantWrites:0,resultSha256:createHash('sha256').update(await fs.readFile(new URL('./result.json',import.meta.url))).digest('hex')},null,2)+'\n');
const entry=`## 페페구 100개당 추첨권1장·10명 추첨 완료 / 지급 전 — 2026-11-06

- 앞선 32명 원문명단으로 **총113장·100개당1장·나머지제외·중복당첨없음**. **족단·0수표·세라네꼬라지·베베킹·블랙캐슬·점빡이·학벌·핫시·랄네미탱탱·숭구릭** 10명 당첨.
- 추첨키 **${result.operationKey}**. 암호학적 seed를 먼저 파일로 고정·가중추첨·당첨계정 전체티켓제외·추적10회 독립 재계산 일치. 원본/seed/결과 operations/${folder}/ 보존. 같은 요청 재추첨 금지.
- **추첨만 완료·페페구 지급0**. 후속 지급 요청 시 이 당첨자 명단 사용. 앞선32명565박스 지급 보존·운영DB쓰기/메시지/게임배포/유지관리/삭제/예약0.

`;
await write('agents-entry.md',entry);
const agentsUrl=new URL('../../AGENTS.md',import.meta.url),agents=await fs.readFile(agentsUrl,'utf8');assert(!agents.includes(result.operationKey));await fs.writeFile(agentsUrl,entry+agents);
const index=fileURLToPath(new URL('records.index',evidence));
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','-c','core.safecrlf=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:5*1024*1024,...options}).trim();
const files=['.gitignore','draw.mjs','seed.json','result.json','README.md','record.mjs'].map(file=>'operations/'+folder+'/'+file),branch='refs/heads/codex/'+folder;
const message=fileURLToPath(new URL('commit-message.txt',evidence));await fs.writeFile(message,'ops: record ten weighted Pepegu raffle winners, no grants [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(result.operationKey));
 git(['read-tree',base]);git(['add','--',...files]);const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 assert.deepEqual(git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean).sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const commit=git(['commit-tree',git(['write-tree']),'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit};break;}catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
await write('records-published.json',JSON.stringify({...published,remote,operationKey:result.operationKey,winnerCount:10,grantWrites:0},null,2)+'\n');
console.log(JSON.stringify({status:'DRAW_RECORD_PUBLISHED',commit:published.commit,winners:result.winners.map(w=>w.nickname),grantWrites:0}));
