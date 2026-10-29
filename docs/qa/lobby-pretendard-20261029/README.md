# 로비·공통 메뉴 Pretendard 통일 — 2026-10-29

사용자 요청: “다 바꿔라 용병도감 폰트로 통일해”. 로비 한글·영문·재화 숫자·계급·출전 표시·좌측 메뉴·분류/전체 메뉴·검색·설명에 섞여 있던 Noto/Barlow를 용병도감과 같은 Pretendard Variable로 통일했다. 콘텐츠 현황의 숫자와 제목, 로비의 BGM·씨나인·계급·현황 팝업에도 같은 패밀리를 적용한다. 기존 글자 크기·굵기·레이아웃·원화·기능 정책은 유지한다.

용병도감 index.html의 Pretendard v1.3.9 dynamic subset URL을 그대로 사용한다. shadow tree 안의 @font-face 별칭 대신 문서 head에 폰트 스타일시트를 한 번 연결한다. 기존 용병도감처럼 이미 같은 link가 있는 페이지에서는 중복 추가하지 않는다. 시안에도 같은 link를 연결했고, 공통 메뉴를 사용하는 별도 페이지 11개와 메인/ONE store의 번들·CSS 캐시를 갱신했다. 새 이미지·폰트 바이너리 복사 없음.

실제 메인 + 격리 API, 음소거 상태에서 PC1440×900 / 모바일390×844 / 320×740 총59확인 통과. CSS.getPlatformFontsForNode로 제목·닉네임·레벨·재화·한글 출전명·영문 PVE/PVP·메뉴 제목/본문/설명·현황 팝업 제목의 실제 사용 폰트가 Pretendard Variable이며 웹폰트인 것을 확인했다. computed font-family만으로 판단하지 않았다. 로비에서 보이는 모든 텍스트의 기본 패밀리, 가로 넘침·재화 잘림·PVE/PVP 버튼 내부 적합·메뉴 열기/닫기·메뉴 가로 스크롤을 확인했다. PC/모바일 스크린샷도 직접 검토했다. 누락 자산0·JS 예외0.

생성 로비 번들 일치 검사와 ONE store 관련7검사 통과. 작은 UI 변경에 필요한 범위만 검사하며 실제 직전 Pages 소스 c82a8be891ec37819694ede96cc237d1d305c0f4를 기준으로 지정 scoped 배포를 사용한다. 운영 반영 뒤 공개10파일·두 Worker100%·공개 모바일의 실제 폰트 렌더링을 짧게 확인하고 completion.json에 기록한다.

기존 tmp/cardgu-live-20261027 희소 체크아웃과 의존성을 재사용했다. 다른 작업 중인 release-checkout은 건드리지 않았다. 증거: C:/Users/User/Downloads/upload/cnine-card/operations/lobby-pretendard-20261029/. 운영 계정/재화 쓰기0·메시지0·실전 진입0. Git 자동 유지관리 OFF, 저장공간 점검·정리·예약·기존 지급 재실행 없음.
