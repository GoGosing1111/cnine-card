import fs from 'node:fs/promises';
export function patchAgents(text){
 const prefix='- **후속 “새 캐릭터로 처음부터 기준점부터 다시 잡아가라” 우선:**',line=text.split(/\r?\n/).find(l=>l.startsWith(prefix));if(!line)throw Error('V3.5 paragraph missing');
 text=text.replace(line,prefix+' 진 족로와 칼 추출/첫 팔 동작, 첫 전진 후보의 무릎 변형은 반려 이력으로 보존한다. [현재 전진 베기·무릎 수정본](preview/v35-character-baseline-20261101/attack-v2/PROJECT.md)은 앞무릎 축, 뒷다리 굽힘 방향, 무릎 보조 뼈, 깨끗한 몸통 보완 원화, 앞발 디딤과 체중 이동을 적용했다. 정본 swordsman-7400ac091863.spine, 29뼈·11부품·1.12초. CLI 왕복·225시점 구조 검사·정상 속도 세 번 실행/녹화·주요 전신 자세와 30fps 무릎 검토를 수행했다. **사용자 시각 승인·던전앤파이터급 달성·실전 연결은 아직 없다.** 수치 검사 통과를 동작 품질 합격으로 확대하지 않는다.');
 const marker='- **화면 비간섭 · 2026-11-01 후속:**';
 if(!text.includes(marker)){const start=text.indexOf('\n',text.indexOf(prefix));text=text.slice(0,start)+'\n'+marker+' 사용자 “내 화면 계속 방해받는데 따로 작업 못함?” 이후 네이티브 편집기·마우스·키보드·사용자 브라우저 조작을 중단했다. 사용자가 다시 명시적으로 요청하기 전에는 재개하지 않는다. 숨김 Spine CLI와 화면 없는 런타임 검수로 계속 작업한다. 공식 편집기 자동화 API와 CLI/외부 JSON 제작을 혼동하거나 미연결 API가 있다고 설명하지 않는다.'+text.slice(start);}
 return text;
}
export function patchStandard(text){
 const prefix='- **최신 제작:**',line=text.split(/\r?\n/).find(l=>l.startsWith(prefix));if(!line)throw Error('Latest production paragraph missing');
 text=text.replace(line,prefix+' [붉은 코트 검사 전진 베기·무릎 수정본](../preview/v35-character-baseline-20261101/attack-v2/PROJECT.md). 첫 전진 후보에서 사용자가 지적한 무릎 변형을 반려 기록으로 남겼다. 실제 무릎 위치에 축을 맞추고 뒷다리 굽힘 방향, 무릎 보조 뼈, 몸통 보완 원화와 코트 가중치를 수정했다. 29뼈·11부품·1.12초 베기의 CLI 왕복, 225시점 구조 검사, 세 번 실행/녹화, 전신 주요 자세와 30fps 무릎 검토를 수행했다. 사용자 시각 승인·DNF급 달성·운영 연결은 없다.');
 const old='3. 로컬 프리뷰에서 파일 기반으로 재생·수정·검수한다. 네이티브 편집기 창 조작이나 원격 마우스/키보드 입력을 자동 재개하지 않는다.';
 const updated='3. 로컬 프리뷰에서 파일 기반으로 재생·수정·검수한다. **2026-11-01 후속 “내 화면 계속 방해받는데 따로 작업 못함?” 우선:** 사용자 편집기·마우스·키보드·브라우저를 조작하지 않는다. 다시 명시적으로 요청받기 전에는 GUI 검수를 이유로 재개하지 않는다. 숨김 Spine CLI와 화면 없는 브라우저에서 공식 런타임을 실행하고 실제 수행한 검수 방식만 기록한다.';
 if(text.includes(old))text=text.replace(old,updated);else if(!text.includes(updated))throw Error('Desktop instruction anchor changed');
 if(!text.includes('무릎 축·굽힘 검수')){const anchor='- **팔 동작 검수:**',i=text.indexOf(anchor);if(i<0)throw Error('Motion QA anchor missing');text=text.slice(0,i)+'- **무릎 축·굽힘 검수:** 그림의 실제 무릎과 뼈 축을 맞추고 양다리의 굽힘 방향을 큰 자세에서 확인한다. 자동 IK의 방향 추정이나 넓은 y축 가중치만 믿지 않는다. 필요하면 무릎 보조 뼈·보완 작화를 사용하고, 준비/디딤/타격/회수 전체에서 관절 면적과 실루엣을 확인한다.\n'+text.slice(i);}
 return text;
}
export function patchParent(text){
 const old=text.split(/\r?\n/).find(l=>l.startsWith('**현재 상태:'));if(!old)throw Error('Parent current status missing');
 text=text.replace(old,'**현재 상태: 전진 베기와 무릎 변형 수정.** [현재 정본·영상·검수](attack-v2/PROJECT.md)는 29뼈·11부품·1.12초 베기다. 첫 전진 후보의 무릎 변형 지적 후 앞무릎 축, 뒷다리 굽힘 방향과 무릎 보조 뼈를 수정했다. 깨끗한 몸통 보완 원화, 앞발 디딤과 체중 이동, 코트 움직임을 반영했다. 기술 검사·전신 주요 자세·30fps 무릎 검토를 수행했으며 사용자 시각 승인·던전앤파이터급 달성·운영 연결은 아직 없다. 화면 방해 지적 이후 사용자 데스크톱 입력을 중단하고 숨김 CLI/화면 없는 런타임으로 작업한다.');
 text=text.replace('| [attack-v1/PROJECT.md](attack-v1/PROJECT.md) | 칼 수정·팔 동작 재작업·1.2초 기본 베기 | 현재 수정안, 사용자 승인 전 |','| [attack-v1/PROJECT.md](attack-v1/PROJECT.md) | 칼 수정·팔 동작 재작업·1.2초 기본 베기 | 과거 수정안·보존 |\n| [attack-v2/PROJECT.md](attack-v2/PROJECT.md) | 전진 디딤·체중 이동·무릎 수정·1.12초 베기 | 현재 수정본, 사용자 승인 전 |');
 return text;
}
export function patchOld(text){const notice='> 후속 정본은 [전진 베기·무릎 수정본](../attack-v2/PROJECT.md)이다. 아래 내용은 06c1f1563f47의 당시 기록이며 현재 정본으로 선택하지 않는다.\n\n';return text.includes(notice)?text:notice+text;}
export function patchSkill(text){const old='- 기본 방식은 파일·명령줄 제작이다. 사용자의 편집기 화면이나 원격 마우스/키보드 조작을 요구하거나 자동 재개하지 않는다.';const next=old+' 2026-11-01 화면 방해 중단 지시 이후에는 사용자가 다시 명시적으로 요청하기 전까지 GUI 검수도 재개하지 않는다. 숨김 CLI와 화면 없는 런타임 검수를 사용한다.';return text.includes(next)?text:text.replace(old,next);}
export function patchManifest(text){const m=JSON.parse(text);m.status='FORWARD_CUT_KNEE_REPAIR_USER_REVIEW_PENDING';m.character.scope='V3.5 전진 베기와 무릎 변형 수정';m.currentRig={...m.currentRig,project:'attack-v2/PROJECT.md',receipt:'attack-v2/qa/native.json',native:'attack-v2/swordsman-7400ac091863.spine',sha256:'7acefc8c706857b88bf85a4c24d21af61c726bdee0933511899efc8730611dd0',attackSeconds:1.12,bones:29,finalVisualApproval:false};m.feedback={...m.feedback,firstForwardStepKneeRejected:true,currentRevisionUserApproval:false};m.desktopInputAllowed=false;return JSON.stringify(m,null,2)+'\n';}
export const policyPatches=[['AGENTS.md',patchAgents],['docs/project-v35-battle-production-standard.md',patchStandard],['preview/v35-character-baseline-20261101/PROJECT.md',patchParent],['preview/v35-character-baseline-20261101/manifest.json',patchManifest],['preview/v35-character-baseline-20261101/attack-v1/PROJECT.md',patchOld],['.agents/skills/cnine-v35-battle-production/SKILL.md',patchSkill]];
if(process.argv.includes('--apply-local')){for(const[p,fn]of policyPatches){const before=await fs.readFile(p,'utf8');await fs.writeFile(p,fn(before));}console.log('Scoped motion and desktop preferences recorded');}
