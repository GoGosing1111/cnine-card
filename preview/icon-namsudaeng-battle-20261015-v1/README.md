# 남수댕 ICON · 왕관 찬탈 리소스 준비

2026-10-15 사용자 지정: 남수댕은 CROWN_USURP(왕관 찬탈). 캐릭터 동작 시트는 만들지 않으며 **정지 전신 SD + 16프레임 스킬 FX**만 제작한다.

첨부 카드 사진은 sources/namsudaeng-photo-original.png에 바이트 그대로 보존한다. SHA-256: 312FA57D9C8F5C55F2FCAF8561377909BE9229091ECDEED314F0160193B7EA39. 카드 프레임은 기존 ICON 원본을 재사용한다. 원본 사진과 새 전투 SD는 별도 자산이다.

- sources/namsudaeng-sd.png: 내장 imagegen 원본 RGBA. 얼굴·몸·의상 모두 같은 2D 작화. 발바닥 기준점은 직접 확인한 원본 픽셀 좌표를 input.json의 footAnchorSource에 기록한다.
- sources/crown-usurp-fx.png: 내장 imagegen 원본 RGBA, 4×4 행 우선 16개의 실제 연속 프레임. 각 셀의 투명 여백과 경계 알파 12 이하를 검증한다. 정지 프레임 복제·가짜 중간 프레임·컬러 키나 알파 재도색을 사용하지 않는다.
- `node preview/icon-namsudaeng-battle-20261015-v1/build.mjs`: 이 폴더만 수정한다. 원본 해시를 검증하고 SD를 비율 유지 672px+48px 여백, 768×768 무손실 WebP로 내보낸다. FX는 384px 셀/1536px 아틀라스로 원시 픽셀 복사한다.
- 파일 또는 발바닥 기준점이 없으면 WAITING_FOR_GENERATED_RESOURCES로 유지한다. 빌드 성공은 사용자 시각 승인을 뜻하지 않는다.
- 공용 V3 mountForBattle / PixiJS / GSAP와 기존 IconEffectPlayback을 import한다. 준비 전용 클래스는 추출→이동→귀속 위치만 보간하며 신체 모션이나 피해를 생성하지 않는다. 단일 GSAP 시계로 재생/정지/0.25×/1×/탐색/FX OFF를 지원한다.
- 기술 효과의 실제 판정은 별도 신규 ICON 기술 준비 엔진과 회귀검사에서 확인한다. 이 페이지는 리소스 검수용이며 전투 수치나 버프 판정을 새로 계산하지 않는다.

실제 카드 ID는 null, 기술 수치는 null이다. 기존 로스터/발급/획득/덱/경제/API/CMS/운영 활성화를 변경하지 않는다. 새 SD·FX는 사용자 시각 검수 대기다.

## 최종 기술 검수 — 2026-10-15

- `node --test preview/icon-namsudaeng-battle-20261015-v1/qa.test.mjs`: 3/3 통과. 사용자 사진 SHA 고정, 원본 SD/FX 해시, 768px 균일 리사이즈, 16개 고유 원본 프레임, 프레임/아틀라스 픽셀 동일성 확인.
- `node preview/icon-namsudaeng-battle-20261015-v1/qa.browser.mjs`: 1440px PC / 390px 모바일 통과. 공용 V3 캔버스 1개, 일반 카드 5슬롯, 용병 0, 0.25×/1×, pause, seek, FX OFF, 종료/중단 후 활성 FX 0, 페이지 이탈 후 캔버스 0, 오류·실패 자산 0. `qa/report.json`에 기록한다.
- `node preview/icon-namsudaeng-battle-20261015-v1/qa.lifecycle.mjs`: 아틀라스 로드 중 dispose 후 늦은 FX 생성 없음, 실제 히스토리 뒤로가기에서 캔버스 1개 복원. `qa/lifecycle.json`에 기록한다.
- 모바일 iframe은 이 준비 페이지가 고정 반응형 높이를 소유한다. 공통 viewport fitter의 상태 알림 높이 피드백을 상속하지 않는다. 도크 사진은 이 페이지에서만 eager/decode 후 준비 상태로 바꿔 모바일 첫 화면의 빈 사진을 방지한다.
- PC/모바일 원본·SD·추출/이동/귀속/FX OFF 화면을 직접 확인했다. 캡처: `qa/1440-overview.png`, `qa/390-overview.png`, 각 해상도별 `-extraction.png`, `-transfer.png`, `-settling.png`, `-fx-off.png`. 실제 재생 녹화: `qa/1440-review.webm`, `qa/390-review.webm`.
- 정확한 생성 프롬프트·입력 이미지 역할·해시: `generation-prompts.json`. 초기 자연체형 SD는 `sources/history/`에 보존하고 현재 SD는 V2만 사용한다. 원본 사진·프롬프트·반려 이력을 재압축하거나 지우지 않는다.

로컬 보기: `http://127.0.0.1:4295/preview/icon-namsudaeng-battle-20261015-v1/`. 기존 읽기 전용 서버 `node scripts/serve-icon-technique-preview-20261015.mjs`를 사용한다. 위 기술 검수 통과와 사용자 시각 승인은 별개이며 운영 등록·획득·전투 적용은 계속 OFF다.
