import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='eumsooni-abyss-equipment-20261030';
const s=JSON.parse(await fs.readFile(new URL('./completion.json',import.meta.url),'utf8'));assert.equal(s.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');assert.equal(s.userId,'65');assert.equal(s.totalQuantity,5);
const entry=`## 음순이 8단계 심연성좌 용병장비 5부위 지급 완료 — 2026-10-30

- **운영 지급 완료:** **음순이 ID65 / 8단계 심연성좌 무기·상의·하의·신발·장신구 각1개, 총5개(각0→1)·기본 +0**, **${s.completedAtKst}·감사${s.auditId}**.
- 사용자 최종 **“8단계: 심연성좌 / 이거로 지급해라”** 적용. 최초 6단계 성휘대천사 지급0. 기존 장비·장착·용병 보유/성장·재화·인벤토리·카탈로그 보존. 자동장착·메시지·게임 재배포 없음.
- 완료 키 **${s.operationKey}**. 같은 요청을 새 키로 재지급하거나 사용 후 수량을 복구하지 않는다.
- 관련4검사·실제 이중잠금 실패/정상 예행연습 원복·독립 READ ONLY·실제 용병장비 목록5개·SELECT 전용 재실행 추가쓰기0·인벤토리 동기화·잠금 반환 확인.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git 자동정리 OFF·승인 없는 유지관리/예약 없음.

`;
const dir=fileURLToPath(new URL('./evidence/',import.meta.url)),index=path.join(dir,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const files=['.gitignore','plan.json','discover.mjs','grant.mjs','grant.test.mjs','prepare-tools.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','independent.mjs','independent.json','finalize.mjs','record-completion.mjs','README.md','completion.json'].map(f=>'operations/'+folder+'/'+f);files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(dir,'commit-message.txt');await fs.writeFile(message,'ops: grant Eumsooni five tier-eight Abyss Constellation equipment pieces [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']),remoteAgents=git(['show',base+':AGENTS.md']);assert(!remoteAgents.includes(s.operationKey),'Operation already recorded');
 git(['read-tree',base]);git(['add','--',...files]);const blob=git(['hash-object','-w','--stdin'],{input:entry+remoteAgents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(dir,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
const local=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');if(!local.includes(s.operationKey))await fs.writeFile(path.join(root,'AGENTS.md'),entry+local);
await fs.writeFile(path.join(dir,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,auditId:s.auditId,userId:'65',totalQuantity:5}));
