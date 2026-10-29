import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder='namsudaeng-daengsoryong-streamer-20261029';
const s=JSON.parse(await fs.readFile(new URL('./completion.json',import.meta.url),'utf8'));assert.equal(s.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');
const entry=`## 남수댕 댕소룡 펫1·스트리머 선물4 지급 완료 — 2026-10-29

- **운영 지급 완료:** **${s.completedAtKst}·감사${s.auditId}/펫${s.petAuditId}**, **남수댕 ID183에 댕소룡 PET-DAENGSORYONG 1마리(0→1)와 스트리머 선물4개(0→4)**. 사용자 후속으로 펫임을 명시 확인, 유사닉 남수댕ㅗ ID5950 제외.
- 기존 펫/장착/잠재력/재화/다른 인벤토리/CMS 보존. 펫 revision2→3, 수집/인벤토리 동기화 확인. 자동장착·개봉·메시지·게임 재배포 없음.
- 완료 키 **${s.operationKey}**. 같은 요청을 새 키로 재지급하거나 사용 후 복구하지 않는다. 관련4검사·실제 이중잠금 실패/정상 원복·독립 READ ONLY·SELECT 전용 재실행 쓰기0·잠금 반환 확인.
- 기록 docs/qa/${folder}/, 증거 operations/${folder}/. 기존 폴더/의존성 재사용·Git 자동정리 OFF·승인 없는 유지관리/예약 없음.

`;
const evidence=fileURLToPath(new URL('./evidence/',import.meta.url)),index=path.join(evidence,'records-'+Date.now()+'.index');
const git=(args,options={})=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...args],{cwd:root,env:{...process.env,GIT_INDEX_FILE:index},encoding:'utf8',windowsHide:true,maxBuffer:6*1024*1024,...options}).trim();
const names=['.gitignore','source.json','plan.json','grant.mjs','grant.test.mjs','preflight.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','README.md','completion.json','finalize.mjs','record-completion.mjs'];
const files=names.map(f=>'operations/'+folder+'/'+f);files.push('docs/qa/'+folder+'/README.md');
const branch='refs/heads/codex/'+folder,message=path.join(evidence,'commit-message.txt');
await fs.writeFile(message,'ops: grant Daengsoryong pet and four streamer gifts to Namsudaeng [CF-Pages-Skip]\n',{flag:'wx'});
let prior='0'.repeat(40),published;
for(let attempt=1;attempt<=3;attempt++){
 git(['fetch','--no-auto-maintenance','origin','main']);const base=git(['rev-parse','origin/main']);
 const agents=git(['show',base+':AGENTS.md']);assert(!agents.includes(s.operationKey),'Already recorded');
 git(['read-tree',base]);git(['add','--',...files]);
 const blob=git(['hash-object','-w','--stdin'],{input:entry+agents+'\n'});git(['update-index','--add','--cacheinfo','100644',blob,'AGENTS.md']);
 const changed=git(['diff','--cached','--name-only',base]).split(/\r?\n/).filter(Boolean);assert.deepEqual(changed.sort(),[...files,'AGENTS.md'].sort());git(['diff','--cached','--check',base]);
 const stat=git(['diff','--cached','--stat',base]),tree=git(['write-tree']),commit=git(['commit-tree',tree,'-p',base,'-F',message]);
 git(['update-ref',branch,commit,prior]);prior=commit;
 await fs.writeFile(path.join(evidence,'records-commit-'+attempt+'.json'),JSON.stringify({base,commit,branch,files:changed,stat},null,2)+'\n',{flag:'wx'});
 try{git(['push','origin',branch+':refs/heads/main']);published={base,commit,branch,files:changed};break;}
 catch(e){if(attempt===3||!/(fetch first|non-fast-forward)/i.test(String(e.stderr||e.message)))throw e;}
}
assert(published);const remote=git(['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];
if(remote!==published.commit){git(['fetch','--no-auto-maintenance','origin','main']);git(['merge-base','--is-ancestor',published.commit,'origin/main']);}
const local=await fs.readFile(path.join(root,'AGENTS.md'),'utf8');if(!local.includes(s.operationKey))await fs.writeFile(path.join(root,'AGENTS.md'),entry+local);
await fs.writeFile(path.join(evidence,'records-published.json'),JSON.stringify({...published,remote,completedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PUBLISHED',commit:published.commit,remote,auditId:s.auditId,petAuditId:s.petAuditId,userId:s.userId,pets:1,boxes:4}));
