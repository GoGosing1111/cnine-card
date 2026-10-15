# 신규 ICON을 기존 선택 목록에 추가하고 제작 잠금

사용자 첨부의 기존 합성 선택 목록에 남수댕·디임(빨간 모자)을 9번·10번으로 이어서 추가한다. 따로 만들었던 신규 준비 목록은 제거한다. 선택하면 같은 카드 무대·제작 조건·스킬 설명을 사용하고 두 카드의 제작 실행만 잠근다.

- 신규: 1조 코인, 마스터의 별 500만 개, 10%, SUPERSTAR +13·FUR +13 각 1장. 목록과 실행 버튼에 제작 잠금을 표시한다.
- 기존 8종: 제작 ON과 5천억 비용을 유지한다. 기존 1회 확정 혜택도 기존 카드에만 표시한다.
- 새 카드를 운영 획득 배열에 편입하거나 카드 ID를 발급하지 않는다. 서버의 신규 코드 423 차단과 덱 최대 2장은 유지한다.
- 원본 사진과 승인 프레임을 재사용한다. 선택한 카드 아래에서 해당 SD·스킬 프리뷰를 열 수 있다.

## 검수

실제 플레이어 셸과 격리 DB를 사용한 PC 1440px·모바일 390px 확인을 통과했다. 같은 선택 목록 10종, 신규 두 항목의 선택·원본 표시·가격·10%·잠금, 기존 카드 복귀 시 제작 가능 상태, 기존 카드에만 100% 혜택 표시를 확인했다. 재료·확인을 강제로 채운 클릭도 신규 제작 POST 0회, 재화·재료 변화 0건이다. 가로 넘침·브라우저 오류가 없다.

- 재현: `tests/icon-expansion-public-off-20261015.browser.mjs`
- 화면·결과: `docs/qa/icon-expansion-selector-lock-20261015/`
- 배포 직전 신규 OFF 및 기존 제작 보존 5개 회귀가 지정 scoped 배포에서 통과했다. 공통 서버·DB·경제·전투 코드는 변경하지 않았다.

## 운영 반영 완료

- 소스 a04d04976, 지정 `npm run deploy:production -- --scoped` 종료 코드 0. 운영 업로드 1회.
- Pages fbedee45: https://fbedee45.cnine-card.pages.dev. 운영 https://cnine-card.pages.dev.
- API Worker be81e389-9d46-4c6c-b963-84e5bb4652ee, 기존 스케줄러 4ae2c9cb-f66a-4f1a-bf72-b254b130fbb1. Hyperdrive query cache OFF 확인.
- 운영 HTML·서비스 워커·합성 번들·CSS 4개 파일 SHA-256이 배포 소스와 일치한다. 캐시는 `20261015-icon-selector-lock-v2`다.
- 공개 역할 API 기존 9종·enabled=true·deckLimit=2 확인. 운영 계정의 제작·재화·지급·설정 쓰기는 수행하지 않았다.
- 증빙: `docs/qa/icon-expansion-selector-lock-20261015/live-verification.json`. 완료 기록만 커밋하며 재배포하지 않는다.
