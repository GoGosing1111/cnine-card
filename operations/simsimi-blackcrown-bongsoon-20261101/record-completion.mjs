import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='simsimi-blackcrown-bongsoon-20261101';
const s=JSON.parse(await fs.readFile(new URL('./completion.json',import.meta.url),'utf8'));assert.equal(s.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(s.userId,'4933');assert.equal(s.code,'V-951');assert.equal(s.quantity,1);assert.equal(s.stockCountersChanged,false);
const entry=`## 심심이 블랙크라운 SS 나무늘봉순 한도 예외 지급 완료 — 2026-11-01

- **운영 지급 완료:** **심심이 ID4933 / 블랙크라운 SS 리미티드 나무늘봉순 V-951 1장(0→1)·1레벨**, **${s.completedAtKst}·감사${s.auditId}**.
- 사용자 **“한도증가없이 1장 지급”** 승인. **발행 한도40/발행40/잔여0 유지**, 새 한정 발행·제작 집계 차감0. 기존 재화/다른 보유/성장/편성/정책 보존.
- 완료 키 **${s.operationKey}**. 같은 요청을 새 키로 재지급하거나 이후 정상 보유·성장을 덮지 않는다. 자동 편성·메시지·게임 재배포 없음.
- 관련4검사·실제 이중잠금 실패/정상 원복·독립 READ ONLY·실제 보유/성장/랭크/PVE·PVP 선택·SELECT 전용 재실행 추가쓰기0·잠금 반환 확인.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git자동정리 OFF·승인 없는 유지관리/예약 없음.

`;
const dir=fileURLToPath(new URL('./evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','plan.json','grant.mjs','grant.test.mjs','preflight.mjs','prepare.mjs','prepare-verification.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','independent.mjs','independent.json','access.mjs','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);
files.push('docs/qa/'+folder+'/README.md','docs/qa/'+folder+'/completion.json');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');
await fs.writeFile(message,'ops: grant Simsimi one Blackcrown SS Namuneulbongsoon without consuming stock [CF-Pages-Skip]\n',{flag:'wx'});
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
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:s.auditId,userId:s.userId,card:s.code,quantity:1}));
