# 용병 성장 화면 공개 · 실행 OFF

2026-10-15 사용자 “반영하고 레벨업만 안되게 OFF해놔” 승인.

## 공개 범위

도감 상단 용병 성장과 보유 용병 상세 바로가기를 기존 도감 스타일로 공개한다. 상세 code는 실제 보유 목록에서만 선택한다. 성장실 V4 이미지 UI·보유 목록·미정 성장표를 열람할 수 있다. 경험치 전수·레벨업·돌파는 OFF다. 두 실행 플래그 MERCENARY_LEVEL_RELEASE_ENABLED와 PVP_POWER_BALANCE_RELEASED는 false를 유지한다. 미정 수치·CMS·보유량·편성·재화는 수정하지 않는다. 준비된 계산/거래 코드는 실행 스위치 뒤에 유지한다.

## 차단과 검수

서버 train/breakthrough/preview는 인증·DB 접근 전423, CMS ON 저장423이며 OFF 조회는 신규 성장 테이블 조회 없이 실제 보유분·초기 레벨과 미정 정책을 제공한다. 재료 수량·전수·돌파 버튼을 비활성화하고 준비 중 안내를 표시한다. 운영 도메인의 preview=1도 로컬 예시를 열지 않는다.

PC1440·모바일390에서 공개 진입/보유 V-055 선택 전달/미정 상태/비활성 버튼/가로 넘침 없음/preview 쿼리 무시/JS오류0/API쓰기0을 확인했다. 증빙은 preview/mercenary-level-v2-20261015/qa/public-off/report.json 및 캡처다.

## 배포 준비

직전 운영 기준은 95ae9437b93b853d314a790d29d4877b6e892c22. 최신 origin/main 변경을 통합하고 관련 도감·OFF 보호·준비 전투 조건 및 Worker 컴파일을 scoped 배포에서 검사한다. 실행 OFF와 현행 전투 보존이 이번 공개의 경계다. 운영 반영 결과는 배포 후 추가한다.

## 운영 반영 완료

사용자의 main 직접 푸시·운영 배포 명시 승인 후 ef11d8ddd7eda9128d6deb0a77beb6dc93fb719e를 main에 반영하고 지정된 scoped 배포를 완료했다. 관련110개 검사 통과, Worker 문법/릴리스·캐시 확인 통과. Pages https://0d351ad8.cnine-card.pages.dev, API Worker 3081c983-680e-4429-a5e6-d4fefd4ed726, 스케줄러0978713e-427c-40fd-801c-65584e146e8d.

운영 도메인 cnine-card.pages.dev에서 공개 도감·성장실·CSS·공용 OFF 플래그·버튼 이미지9개가 검수 원본 SHA-256과 일치했다. feature GET200/releaseEnabled=false, train·breakthrough·preview POST는 각각423/MERCENARY_LEVEL_PREPARATION, 비로그인 state GET401을 확인했다. 요청은 인증·DB 접근 전 차단되며 운영 계정·보유량·설정 변경을 하지 않았다. 실제 공개 진입은 /mercenary-codex/ 및 /mercenary-codex/leveling/. 결과 JSON은 같은 문서명 .json이다.
