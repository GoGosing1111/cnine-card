import fs from 'node:fs/promises';
export function patchAgents(text){
 const prefix='- **후속 “새 캐릭터로 처음부터 기준점부터 다시 잡아가라” 우선:**';
 const line=text.split(/\r?\n/).find(l=>l.startsWith(prefix));if(!line)throw Error('V3.5 baseline paragraph missing');
 return text.replace(line,prefix+' 진 족로 Spine 조립은 반려·보류, V7 원화 승인은 보존한다. baseline-v4의 과거 대기는 보존하되 칼의 16px 선택 마스크 오류와 첫 베기의 **“팔이 각목”** 같은 동작은 사용자 반려로 기록한다. [현재 수정안·영상·편집 파일](preview/v35-character-baseline-20261101/attack-v1/PROJECT.md)은 칼 재추출, 가려진 그림 보완, 갑옷/소매 분리와 어깨→팔꿈치→손목 FK 타이밍으로 재작업한 1.2초 베기다. 27뼈·11부품의 CLI 왕복·구조 검사·정상 속도 녹화·선택 자세 검토는 수행했으나 **사용자 시각 승인·던전앤파이터급 품질 달성·실전 연결은 아직 없다.** 원본 픽셀 일치나 뒤집힘 0을 올바른 부품 선택·동작 품질의 증거로 확대하지 않는다.');
}
export function patchStandard(text){
 const prefix='- **최신 제작:**';const line=text.split(/\r?\n/).find(l=>l.startsWith(prefix));if(!line)throw Error('Latest production paragraph missing');
 text=text.replace(line,prefix+' [붉은 코트 검사 팔 동작 수정안](../preview/v35-character-baseline-20261101/attack-v1/PROJECT.md). 사용자 “해봐 그럼” 이후 기본 공격을 만들었으나 칼 추출 오류와 “팔이 각목” 같은 동작으로 반려됐다. 검의 원본 픽셀 재선택·가려진 손잡이 보완, 갑옷/소매 분리, 어깨→팔꿈치→손목 FK와 서로 다른 타이밍으로 재작업했다. 27뼈·11부품·1.2초 공격의 네이티브 왕복, 구조 검사·정상 속도 세 번 실행/녹화·선택 자세/390px 검토를 수행했다. 사용자 시각 승인과 DNF급 달성·운영 연결은 없다. 반려 기록과 원본은 보존하며 진 족로는 계속 보류다.');
 const marker='- 양손 무기는 변환 주체 하나와 두 파지점을 정한다.';
 if(!text.includes('칼 단독 알파 검수')){const i=text.indexOf(marker);if(i<0)throw Error('Rigging policy anchor missing');text=text.slice(0,i)+'- **칼 단독 알파 검수:** 캐릭터 합성 전에 칼만 밝은/어두운 배경에 표시한다. 검날의 연속 윤곽·온전한 손잡이·옷 조각 혼입을 확인한다. 원본 픽셀 일치 검사는 선택한 영역의 의미가 올바른지 보장하지 않는다. 가려진 부위는 보완 작화하고 그 영역을 기록한다.\n- **팔 동작 검수:** 어깨 갑옷과 유연한 소매의 움직임을 구분하고 어깨·팔꿈치·손목의 선행/지연, 경로와 구간 속도를 실제 재생에서 판단한다. 모든 관절에 같은 완급을 반복 적용하지 않는다. 사용자 반려는 구조 검사 통과보다 우선하며, 수정안의 시각 승인을 자동으로 기록하지 않는다.\n'+text.slice(i);}
 return text;
}
if(process.argv.includes('--apply-local')){for(const [p,fn]of [['AGENTS.md',patchAgents],['docs/project-v35-battle-production-standard.md',patchStandard]]){const before=await fs.readFile(p,'utf8');await fs.writeFile(p,fn(before));}console.log('Scoped V3.5 production feedback recorded');}
