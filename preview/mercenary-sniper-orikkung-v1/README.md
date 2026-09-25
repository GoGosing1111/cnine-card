# 저격 오리꿍 · SS · V-050
사용자 지시(2026-09-26): 승인 원화를 SS 용병으로 출시하고, 희귀 획득·원거리 최상위 포지션·전용 스킬·SD를 제작하여 적용.
원화 V3만 사용자가 시각 승인했다. 신규 SD/FX는 사용자의 제작·적용 지시에 따라 제작하고 아래 기술·시각 검수로 확인했다.

## 원화와 파생 자산
- 승인 원화: `assets/ui/project-v/mercenaries/approved-20260926/mercenary-v050-sniper-orikkung-source-art-v1.png`
- 원화 SHA-256: `6D5A5D58F2A85E1BCA8269508F6E69BAB56D3AD7F318FF471054B98DF3E3EF01`. 1024×1536 RGB PNG, 승인 파일 바이트 그대로 복사.
- SD: `assets/ui/project-v/characters/mercenary/mercenary-v050-sniper-orikkung-sd-v1.png`; 실제 알파, 640×640, 사격 동작의 0번 프레임과 동일.
- 고글을 이마에 올린 헤드기어·헤드셋·노란 오리·사막색 재킷/카고 바지·주황 오리발·수평 에메랄드 대물저격총 유지.
- 내장 ImageGen 사용. [동작 프롬프트](prompt-motion-v1.txt), [탄착 프롬프트](prompt-impact-v1.txt).
- 동작 6종은 대기→조준→반동→볼트 재장전→복귀→대기 전환으로 실제로 서로 다른 관절/자세.
- 이펙트 16종은 탄착 집중→백금색 섬광→에메랄드 충격/금속 파편→연무/잔광 소멸.
- `build-assets.mjs`는 원본 알파를 유지한 추출·투명 패딩·무손실 WebP 아틀라스 조립만 수행. 원화/총기 재도색이나 합성 중간 포즈 생성 없음.
- 각 자산 해시·원본 좌표·발끝·총구 위치는 [manifest.json](manifest.json).

## 실제 전투 연결
- 서버: `functions/_mercenary_combat.js`, `shared/mercenary-sniper-orikkung-v1.mjs`, `shared/mercenary-ranged-balance-v1.mjs`.
- 후열 SNIPER. 적 후열 중 전투 시작 공격력 최대 대상, 없으면 전열. 기본 공격은 기존 전열 타격.
- MS-050 **에메랄드 대물저격**: 피해 7.2배 / 재사용 2턴 / 자원 25. SS 기본 전투력 120000 유지.
- 한 행동에서 한 번의 서버 피해만 적용. PVP 상한 조정 1.65, 기존 방어·회피·보호막·호위·피해 경감 적용.
- 시전자 사망·기절·침묵 차단, 대상 없음은 비용 미소모. 기본 5장 + 별도 용병 1슬롯 계약 유지.
- 공용 PixiJS 8.20.0·GSAP 3.13.0. `source/SniperOrikkungSkillFX.js` 및 `preview/project-v-v3/source/battle/SniperOrikkungCombatPlayback.js`.
- 스킬 발사 0.52초, 충돌 0.60초, 종료 2.40초. 평타는 같은 모션을 1.8배 진행, 1.25초 종료. 각 프레임 총구 좌표에서 궤적 시작.
- GSAP 하나의 시간으로 동작·발사·충돌·사운드 배속/취소 제어. 텍스처 프레임 뷰만 해제, 공용 베이스 텍스처 유지.
- 실제 .50 BMG 녹음(기존 `sniper` 프로필, Freesound 737570, CC0 1.0)과 기존 `critical` 충돌 폴리(Mixkit Free License) 재사용. 출처·자산 ID·해시·원본 라이선스는 `preview/project-v-mercenary-system-v1/skill-audio-v1.json` 및 참조 manifest에 보존.
- MS-050 사운드 준비·발사·충돌·잔향 분리, 충돌 최대 피크는 0.60초에 정렬(±20ms 기준).

## 추첨
- SS 당첨 후 선택 확률 1%. 현재 SS 등급 확률 0.05% 기준 전체 개봉 확률 0.0005%.
- SS 등급 전체 확률·기존 SS끼리 상대 가중치·다른 등급/재화 확률·개봉 비용/플래그 유지.
- 신규 코드가 CMS에 저장되기 전에도 동일 희귀 가중치를 적용. 운영자가 이후 명시적으로 저장한 값은 우선.
- 감사 기록과 CMS/추첨 정책은 운영용 작업 `scripts/ops/sniper-orikkung-release-20260926.mjs`에서 한 PostgreSQL 트랜잭션으로 저장. 버전 충돌·재시도·중간 실패 처리.

## 검수
- 투명 경계, 원화/SD 해시, 6개 동작/16개 FX 고유 픽셀, 발끝·총구 좌표 확인.
- Pixi 재생/일시정지/탐색/2배속/취소·스케일 복원·GPU 프레임 해제 확인.
- SQLite·PostgreSQL 희귀 지급/차감/실패 원자성/중복 요청/정책 변경 후 기존 결과 복구 검사.
- 운영 CMS 57 기준 원거리 13종, 3개 전투력 구간, 4개 덱, 양 진영, 32개 시드 = PVP 9984회. [결과](balance-report.json): 모든 비교에서 우세; SS 상대 승률 약 69.8~76.4%. PVE 세 구간 모두 피해량 최상위. 특정 모든 덱의 승리를 보장한다는 의미는 아님.
- PC 1440px·모바일 390px 도감/SD/한글/스크롤과 공유 V3 시연 검수. 실제 로컬 계정 API의 PVE/PVP 페이로드로 일반 5장+용병, 평타/스킬, 서버 HP 일치와 콘솔 오류 없음 확인.
- 재현 스크립트: `scripts/qa-sniper-orikkung-20260926.mjs`, 결과는 작업 트리 바깥 `../qa/sniper-orikkung-20260926/`.
