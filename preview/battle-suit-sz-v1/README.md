# S-BODY / Z-BODY 무기 착용 리소스

2026-09-16 사용자 승인 외형. 순서 **H-BODY → S-BODY → Z-BODY**.

두 바디에 H-BODY의 원본 총기 합성·V3 사격 방식을 적용했다. 무기 6종씩 **전투 PNG 12개, 고해상도 PNG 12개, 아틀라스 6개**, 비무장 전신 2개다.

## 보기

- [무기 선택·사격 검수](index.html)
- [전체 12종 비교](qa/all-loadouts.png)
- [양손 접점 확대 비교](qa/hand-contact-review.png)
- [등록·승인 기록](approval.json)
- [리소스 명세](manifest.json)

프로젝트 루트에서 `node preview/battle-suit-sz-v1/serve.mjs`를 실행한 뒤 `http://127.0.0.1:8796/preview/battle-suit-sz-v1/`에 접속한다. PC는 두 바디를 함께 표시하며, 모바일은 S-BODY/Z-BODY 탭으로 바꾼다. 6종 무기 선택·단발/연속 사격·밝은/어두운 배경·개별 파일 다운로드를 제공한다.

## 승인 원화

| 이름 | 외형 | 고정 원본 SHA-256 |
| --- | --- | --- |
| S-BODY | 화이트·블루·레드 항공형 메카 | `A497FBB8A4DE40B10951E08BA06120CC36295472980C12A35777DBA67886D15C` |
| Z-BODY | 화이트·블랙·골드 성기사, 최종 헬멧·입 장갑·청색 눈 | `094A2C618F2683059FA129DE5DA2BCE558D5774748477D9AD26C3B41CE62CD6D` |

원화는 `assets/sources/*-approved-v1.png`에 무가공 보관한다. Z-BODY는 최종 색감 고정본이며, 과거 후보1의 왕관형 머리는 현 승인 외형이 아니다. 배경용 마젠타 매트는 알파 추출에만 사용하고 원본 RGB를 유지했다. 무기 장착 자세 제작 뒤에도 머리와 하체는 원본 영역으로 복원하며 경계만 합성했다. 전체 명암·색상 보정은 적용하지 않았다.

## 규격 및 원본 총기

| 무기 | 고해상도 기준 전체 폭 | 전체 회전 | 방향 반전 |
| --- | ---: | ---: | --- |
| 아발론 M4A1 | 700px | 0° | 사용 |
| 인피니티 AK | 700px | 0° | 사용 |
| 인피니티 M200 | 980px | 0° | 사용 |
| 소버린 SKS | 840px | +6° | 사용 |
| 금룡 돌격소총 | 900px | 0° | 없음 |
| 금룡 대물저격총 | 980px | 0° | 없음 |

- 고해상도: **1280×1536 RGBA**, 동일한 오른쪽 3/4 전신.
- 전투 PNG: **384×512 RGBA**, 발바닥 기준 y=479.
- 아틀라스: **1536×1024**, 4열×2행. M4A1/M200, AK/SKS, 금룡 AR/대물 3쌍씩.
- `ready → fire → recoil → recover`에 같은 조준 자세를 배치한다. 관절 4포즈 애니메이션이 아닌 H-BODY의 기존 정지 조준+실시간 총구·탄도 연출 계약이다.
- 기존 `exact-weapon-fit.mjs`의 균일 변환을 재사용한다. SKS·금룡 2종의 승인 폭·반전·각도를 계승하며 다른 무기도 몸 높이 대비 길이를 먼저 정했다.
- 이미지 생성은 고정된 초록색 총기 프록시 주변의 팔·손 제작에만 사용했다. 최종 총기는 원본 투명 PNG이며 총열 변형·비균일 확대·무기 재작화는 없다.
- 생성 과정에서 프록시가 이동한 조합은 원본 총기를 **같은 크기·각도인 채 통째로 평행 이동**하여 정합했다. 조합별 `authored.proxyRegistration`, `placement`, `handBoxes`에 수치를 기록했다. 공통 프록시 상자에 맞춘 축소는 사용하지 않는다.
- 원본 무기 해시 6개, 최종 파일 해시, 총구·발바닥 좌표는 명세에 포함한다.

## V3 검수

프리뷰는 기존 `preview/project-v-v3/source/battle/AccountBattleUnit.js`와 `BallisticVFX.js`를 직접 사용한다. 새 리소스 명세의 `profile`을 `setAuthoredSheet`로 공급한다.

- PixiJS **8.20.0**, GSAP **3.13.0**; 공용 ballistic atlas 버전 `1970-ballistic-impact-v1`.
- 샷 타임라인: ready 45ms / fire 45ms / recoil 70ms / recover 125ms.
- 1440×1000 PC와 390×844 모바일에서 12조합 선택·사격·ready 복귀 확인.
- 총구 앞쪽 표적, 단발/연속 사격, 사격 도중 무기 교체 취소, 다운로드 확인.
- 밝은/어두운 바탕에서 전신·총구·손가락 접점 확인. 가로 넘침 없음.
- [자산 검사 결과](qa/asset-report.json), [브라우저 검사 결과](qa/browser-report.json).

## 재현

프로젝트 루트에서 실행한다.

```powershell
node preview/battle-suit-sz-v1/prepare-inputs.mjs
node preview/battle-suit-sz-v1/build-assets.mjs
node preview/battle-suit-sz-v1/build.mjs
node preview/battle-suit-sz-v1/qa-assets.mjs
```

`assets/sources/*-pose-v1.png`는 보존된 이미지 생성 결과다. 생성은 [PROMPTS.md](PROMPTS.md), 매트·원본 RGB·변환 입력은 `assets/prepared/`에 남겼다. 재생성 없이 위 명령으로 합성과 아틀라스를 재현할 수 있다. 재빌드는 검수 상태를 진행 중으로 초기화한다.

압축 다운로드의 `sprites/`, `atlases/`는 각각 이 폴더의 `assets/sprites/`, `assets/atlases/`에 대응한다. `manifest.json`의 경로와 좌표를 함께 사용한다.

## 적용 범위

2026-09-16 사용자의 `라이브 배포해 전체 승인`과 `슈터코어 5 6 만들고` 지시로 전체 무기 리소스의 운영 연결과 슈트 코어 5·6 등록이 승인됐다. 순서는 **H-BODY → S-BODY → Z-BODY**다.

| 바디 코드 | 제작 재료 코드 | 운영 리소스 |
| --- | --- | --- |
| `BATTLE_SUIT_S_BODY` | `SUIT_CORE_5` | 화이트·블루·레드 바디와 청색 반응로 |
| `BATTLE_SUIT_Z_BODY` | `SUIT_CORE_6` | 흑백·골드 성기사 바디와 금색 반응로 |

기존 승인 PNG와 아틀라스를 그대로 운영 경로로 복사했다. 단일 운영 확장 명세는 `assets/ui/project-v/account-battle-suits/sz-body-v2124.json`, 런타임은 `2124-sz-body-core`다. 계정 캐릭터는 기존 H-BODY와 같은 PVE 지원 유닛이며 PVP에는 생성하지 않는다.

코어 5·6의 원본과 [생성 기록](CORE-PROMPTS.md)을 보관했다. 코어는 직접 사용하지 않는 제작 재료다. 신규 장비의 전투력은 0으로 등록하며 미정 전투력·제작비·재료 수량·확률·획득 경로는 운영자 CMS 정책으로 남긴다. 기존 CMS 수치는 보존한다. 출시·검증·롤백 기준은 [V2124 기록](../../docs/battle-suit-sz-body-v2124.md)을 따른다.
