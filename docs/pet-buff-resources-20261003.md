# 펫 버프 리소스 · 기존 4종 CMS 등록 — 2026-10-03

사용자 요청: 펫 버프 리소스를 제작하고 현재 효과를 확인한다. 이어 기존 펫 프리뷰 4종을 라이브에 올려 등록한다.

## 반영 범위

- 공격력 증가, 방어력 증가, 최대 HP 증가, 속도 증가, 시작 보호막: 전용 투명 아이콘 5장, 8프레임 발동 아틀라스 5장(총 40프레임)을 제작했다.
- 붉은 교차 검 / 푸른 갑옷 / 녹색 심장 / 황금 날개 번개 / 보라 결계로 구분한다. 내장 image_gen의 개별 생성과 가장자리 여백 보정으로 제작했다. 원본 PNG를 보존하고 Sharp로 정수 좌표 아틀라스·아이콘을 내보냈다.
- 자산: `assets/ui/pets/buffs-v1/`. 해시·규격: 같은 폴더 `manifest.json`. 정확한 프롬프트·입출력 경로: `preview/pet-buffs-v1/prompts.json`.
- `/preview/pet-buffs-v1/`: 버프 선택, 1회/반복 재생, 모션 축소, 작은 아이콘, 전체 8프레임 확인 화면.
- CMS의 버프 종류와 펫 장착창의 버프 항목에 아이콘을 연결했다. CMS에서 리소스 검수 화면으로 이동할 수 있다. 실제 전투 엔진의 수치·확률·적용 로직은 변경하지 않는다.

## 기존 효과의 실제 동작

| 효과 | 현재 준비 엔진 동작 |
| --- | --- |
| 공격력 증가 | 지정 비율만큼 공격력 증가 |
| 방어력 증가 | 지정 비율만큼 방어력 증가 |
| 최대 HP 증가 | 최대 HP 증가, 현재 HP 비율 유지 |
| 속도 증가 | 지정 비율만큼 속도 증가 |
| 시작 보호막 | 최대 HP 버프 적용 후의 최대 HP를 기준으로 보호막 추가, 피격 시 소모 |

전투 시작에 한 번 적용한다. 일반 카드 / 용병 / 모두와 PvE·PvP를 펫마다 선택할 수 있다. 펫은 전투 행동·피격 대상 슬롯을 차지하지 않는다. 효과량은 사용자 미지정이며 이번 작업에서 임의로 정하지 않는다.

## 운영 CMS 등록 완료

2026-10-02 19:55:44.905 UTC (10월 3일 KST), 기존 OWNER 세션으로 운영 CMS에서 일러스트 선택 → 펫 초안 추가 → CMS 저장을 실행했다. CMS 버전 1 → **2**.

- 추가: PET-BONGSOON 봉순, PET-JOEUN 조은, PET-HEEYA 희야(돼지), PET-DIIM 디임.
- 기존 PET-GUSUDAENG 토끼 구수댕 보존. 총 5종.
- 각 원화는 `shared/pet-art-catalog-v1.mjs`의 기존 원본·해시를 유지한다. 재생성·재압축하지 않았다.
- 새 4행은 CMS의 기본 공격력 증가 초안이며 증가율 `null`, 전투 SD 빈 값, 검수 사용 `false`다. 이는 효과 배정 확정이 아니며 CMS에서 편집할 수 있다.
- 저장 후 DB를 읽어 이름·모드·대상·증가율·잠금을 확인했다. `visibility=CMS_ONLY`, `battleEnabled=false`, `acquisitionEnabled=false`.
- 프리뷰 원화 등록과 전투 SD 승인·실전 출시를 구분한다. 보유 지급이나 실제 편성 변경은 수행하지 않았다.

## 검수·배포 범위

국소 자산·CMS/장착창 아이콘·독립 프리뷰 추가다. DB·인증·거래·전투 기반 변경이 없다.

- 직전 canonical Pages 커밋: `dff3bf775461782ffa162ca1c80b340d7ca9240b`, 배포 `cb4c02dc-fb39-4536-b3dc-c289ab385a4b`.
- `tests/pet-buff-resources-20261003.browser.mjs`: PC 1440×1050, 모바일 390×844. 버프 5종·8프레임·1회/반복·모션 축소·교체 시 캔버스 정리, 펫 5종 실제 원화·미정 표시, CMS 아이콘/링크 확인. 가로 넘침·페이지 오류 없음. 캡처를 직접 확인했다.
- 브라우저 QA는 격리된 로컬 fixture를 사용하며 운영 버프 값이나 장착 상태를 바꾸지 않는다.
- 관련 회귀: `tests/pet-buff-resources-20261003.test.mjs`, `tests/pet-equipment-20261002.test.mjs`, `tests/companion-preparation-20261002.test.mjs`.
- 선택 회귀는 지정 `npm run deploy:production -- --scoped`에서 한 번 실행한다. 전체 게임 검사와 중복 검사는 하지 않는다. 출시 잠금·캐시·Hyperdrive 검사는 유지한다.
- 검수 캡처: `C:/Users/User/AppData/Local/Temp/pet-buff-qa-20261003/`.

## 운영 배포 결과

- 배포 커밋: `dd706edc46e14c97b874588b65f2fecb0ecb65c1`.
- 지정 scoped 배포 완료. 관련 검사 **21/21**, 출시 잠금·캐시·Hyperdrive 확인 통과.
- Pages: `50774bf0-dc8d-461d-bed3-546a6cc3c1fb`, `https://50774bf0.cnine-card.pages.dev`. canonical production의 커밋·success 일치.
- API runtime: `933fd6f5-037c-4644-84a9-5ee4b5e58f3e`. Clan draft: `1e760aae-ba52-41a9-a29e-65f55e420309`.
- 운영 파일 **21개**의 SHA-256 일치: 신규 버프 아틀라스/아이콘 10개, 기존 펫 원화 5개, 변경 표시 모듈/스타일 6개. 운영 페이지 5개의 새 캐시 버전/화면 표시 확인.
- 운영 OWNER 장착창에서 봉순·조은·희야·디임·토끼 구수댕 **5마리**와 각 원화, 증가율 미정을 확인했다. 운영 CMS 저장은 위의 버전 2다.
- 라이브 버프 프리뷰를 열어 5종 선택과 새 리소스 연결을 확인했다.
- 결과 기록은 `C:/Users/User/AppData/Local/Temp/pet-buff-live-verified-20261003.json`, 배포 로그는 `pet-buff-deploy-20261003.log`에 보관한다.

이 결과 기록은 문서 변경만 범위 커밋·원격 반영하고, 이미 통과한 검사나 운영 배포를 반복하지 않는다.
