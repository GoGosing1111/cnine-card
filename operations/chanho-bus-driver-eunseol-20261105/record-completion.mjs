import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='chanho-bus-driver-eunseol-20261105';
const s=JSON.parse(await fs.readFile(new URL('./completion.json',import.meta.url),'utf8'));assert.equal(s.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(s.userId,'4597');assert.equal(s.quantity,1);assert.equal(s.limitedStockConsumed,0);
const entry=`## 찬호 버스기사 칭호·은설 지급 완료 — 2026-11-05

- **운영 완료:** **찬호 ID4597**, **버스기사 RAID_BUS_DRIVER / 655095 영구 칭호**·**은설 V-973 SSS LIMITED 1장(0→1)·1레벨**, **${s.completedAtKst}·감사${s.auditId}**.
- 완료키 **${s.operationKey}**. 같은 요청 새키재지급·이후 정상 소비/성장/칭호 변경 덮기 금지. USER_LOCK/DB 잠금·현재 보유 비교·칭호/용병/획득/감사/영수증 단일거래.
- 관련4검사·운영 실패/정상예행원복·독립 READ ONLY 실제 계정/랭크 보유·편성 가능·SELECT재실행쓰기0·잠금반환 확인. collection+1/랭크원본+2·점수변경0.
- 기존 다른5명 칭호/현재장착·재화/성장/다른보유/편성 보존. 팩한도4/발행3·큐브5/2·기존발행/제작 유지·새시리얼0. 앞선 버스기사250조 재지급0.
- 기록 docs/qa/${folder}/, 원본 operations/${folder}/. 자동장착/메시지/게임재배포/유지관리/삭제/예약0·기존폴더/의존성재사용.

`;
const dir=fileURLToPath(new URL('./evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,...options}).trim();
const files=['.gitignore','preflight.mjs','plan.json','grant.mjs','grant.test.mjs','prepare.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','independent.mjs','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');await fs.writeFile(message,'ops: grant Chanho permanent bus driver title and one Eunseol [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(s.operationKey),'Operation already recorded');
 git(['read-tree',base]);git(['add','--',...files]);const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(dir,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
const local=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');if(!local.includes(s.operationKey))await fs.writeFile(path.join(root,'AGENTS.md'),entry+local);
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:s.auditId,userId:s.userId}));
