# S-BODY / Z-BODY 무기 리소스 제작

## 사용자 승인 및 범위

- 2026-09-16: 화이트·블루·레드 기체 S-BODY 승인. 금장 성기사 Z-BODY는 색감 고정 수정본을 최종 승인.
- 사용자 표기: **S-BODY, Z-BODY**. 순서 **H-BODY → S-BODY → Z-BODY**.
- 요청: H-BODY와 동일한 방식으로 두 바디의 무기 착용 리소스 제작.
- 기존 무기 6종 × 두 바디 = 12개 전신 PNG. 384×512 RGBA, 4열×2행 아틀라스 총 6장.
- 원본 총기를 그대로 균일 변환·합성. AI는 고정 녹색 프록시 주변의 팔·손 자세만 제작.
- 승인된 원화와 Z-BODY의 색감은 잠금. H-BODY 승인본·운영 파일은 수정하지 않음.
- 본 문서는 리소스 제작 기록이며, 전투력·비용·확률은 미정.

## 원본

- S-BODY: `assets/sources/s-body-approved-v1.png`
- Z-BODY: `assets/sources/z-body-approved-v1.png`
- Z-BODY 색감 고정 기준: `assets/sources/z-body-color-reference-v1.png`
- 색감 고정 검증: `assets/sources/z-body-color-lock-verification.json`
- 기준: `../battle-suit-prestige-v1/README.md`, `../battle-suit-prestige-v1/exact-weapon-fit.mjs`, `../../docs/project-v-account-battle-suit-standard.md`

## 진행

1. 승인 원본과 원본 RGB를 유지한 투명 본체 보관 완료.
2. 12조합의 고정 프록시 입력과 개별 팔·손 파지 생성 결과 보관 완료.
3. 원본 총기 합성 12종, 전투 PNG 12종, 고해상도 12종, 아틀라스 6종, 비무장 PNG 2종 완료.
4. 원본 총기 해시·가시 픽셀, 승인 하체 RGB, H-BODY 잠금 파일, 실제 알파·총구·발바닥 검사 통과.
5. 공용 V3 렌더러에서 PC·모바일 무기 전환·사격·사격 취소·연속 사격 정지·밝은/어두운 바탕 검수 통과.
6. 최종 기준은 README.md, approval.json, manifest.json과 qa/의 검사 기록.

## 2026-09-16 운영 연결 승인

- 사용자 `라이브 배포해 전체 승인` 이후 12개 무기 리소스의 라이브 PVE 연결을 준비했다.
- 후속 `슈터코어 5 6 만들고`에 따라 S-BODY용 슈트 코어 5, Z-BODY용 슈트 코어 6을 각각 제작했다. 원본과 CORE-PROMPTS.md를 보관한다.
- 기존 승인 PNG·아틀라스를 운영 경로에 바이트 그대로 복사하고 전용 프로필 12개를 기존 공용 카탈로그에 추가했다. 총 36개 조합이다.
- SQLite·PostgreSQL에서 등록·실패 시 롤백·재시도·기존 CMS 값 보존을 검증했다.
- 라이브 연결과 제작 수치는 구분한다. 신규 전투력은 0, 제작비·수량·획득 정책은 CMS에서 정한다.
- 세부 검증과 운영 반영 기준은 ../../docs/battle-suit-sz-body-v2124.md를 참조한다.
