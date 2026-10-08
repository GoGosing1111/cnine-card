import fs from'node:fs/promises';import{fileURLToPath}from'node:url';
const root=new URL('../',import.meta.url),file=p=>fileURLToPath(new URL(p,root));
async function edit(path,transform){const before=await fs.readFile(file(path),'utf8'),after=transform(before);if(before!==after)await fs.writeFile(file(path),after);}
await edit('mercenary-codex/app.mjs',s=>s.replaceAll('20261009-deployment','20261009-helios').replaceAll('<p>${esc(c.title)}</p>','${c.title?`<p>${esc(c.title)}</p>`:""}').replace('<em>${esc(c.title)}</em>','${c.title?`<em>${esc(c.title)}</em>`:""}'));
await edit('mercenary-codex/shell.mjs',s=>s.includes('helios=20261009')?s:s.replace('/mercenary-codex/app.mjs?','/mercenary-codex/app.mjs?helios=20261009&amp;'));
const preview='preview/mercenary-limited-solar-sword-20261009-v1/';
for(const p of ['index.html','battle.html','source/preview.js'])await edit(preview+p,s=>s.replaceAll('태양검 군주','헬리오스').replaceAll('헬리오스(가칭)','헬리오스').replace(' / 이름은 가칭',' / 이름 확정 · 칭호 미지정').replace('SOLAR SOVEREIGN','HELIOS').replace('태양을 거느리는 검.','헬리오스'));
await edit(preview+'pack-assets.mjs',s=>s.replace("workingTitle:'태양검 군주'","name:'헬리오스',title:'',titleStatus:'DEFERRED_BY_USER',code:'V-999'"));
await edit(preview+'README.md',s=>s.replace('# SSS 리미티드 태양검 전투 리소스','# SSS 리미티드 헬리오스 전투 리소스').replace("이름 ‘태양검 군주’는 가칭이다.","사용자 후속 지시로 이름은 **헬리오스(V-999)**로 확정하고 칭호는 비워둔다. 도감에는 승인 원화와 제작된 SD를 공개한다.").replace('CMS, 획득, 편성, 전투 수치 및 운영 활성화는 연결하지 않았다.','획득, 편성, 전투 수치 및 운영 전투 활성화는 연결하지 않았다.').replace('원화·등급 확정과 광원에 대한 긍정 피드백을 동작/무기 최종 승인으로 확대하지 않는다.','원화·등급·이름·도감 공개 확정과 광원에 대한 긍정 피드백을 동작/무기 최종 승인으로 확대하지 않는다.'));
console.log('Helios name set, title deferred, empty title markup removed.');
