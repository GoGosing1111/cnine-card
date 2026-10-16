# 카드·카드팩 리버스콜 로고 전환

사용자 요청: 도감 카드 프레임/디자인과 카드상점 팩의 SOOP 표기를 리버스콜 로고로 바꾼다. 일반 리미티드·얼티메이트·하이퍼팩을 포함하며 상점과 실제 개봉 연출이 같은 새 이미지를 사용한다.

## 이미지와 표시 경로

- 새 팩 13종: 일반 리미티드, 얼티메이트, 하이퍼, 고급, 용병 리미티드, 할로윈, 마법 시즌 2, 스탠더드, 프리미엄, MA 확정팩, 마법 시즌 1, 블랙미라클 카드 뒷면, 슈퍼스타.
- 기존 리미티드/MA 확정 큐브의 앞·윗면도 교체했다. 마법카드 소환 화면의 구 `magiccard.png` 표지는 새 시즌 1 팩으로 연결한다.
- **내장 image_gen 편집 모드**로 원본과 사용자 R 로고를 참조해 14종을 제작했다. sharp는 크기·포맷 파생에만 사용했다. 공식 로고와 이전 팩 원본은 변경하지 않았다.
- [원본·파생 파일 및 SHA-256 색인](../assets/ui/packs/reverse-call-20261016/manifest.json), [전체 제작 프롬프트](../assets/ui/packs/reverse-call-20261016/prompts.json), [옛 이미지 주소 연결표](../assets/ui/packs/reverse-call-20261016/legacy-aliases.json), [전체 이미지](qa/reverse-call-card-packs-20261016/all-packs.png).
- 160/320/768px WebP와 AVIF를 새 버전 경로에 저장했다. `picture`의 모든 source·img와 Pixi 개봉 텍스처, 인벤토리·CMS·공통 팩 상수를 연결했다. DB에 저장된 구 주소와 구 최적화 해시 주소도 새 이미지로 바로 연결한다.
- 도감·덱·전투·연금·카드 공개의 `SOOP` 헤더와 카드 뒷면에 공식 R 이미지를 표시한다. 전역 CNINE→SOOP DOM 문자열 치환을 제거하여 실제 닉네임과 채팅을 보존한다. 별도 게임 소유 영문 라벨은 REVERSE CALL로 수정했다. 외부 SOOP 방송/게시판 명칭과 내부 호환성 식별자는 유지한다.
- ZENITH·SUPERSTAR·ICON·Faker·FUR 고급 프레임과 승인된 리미티드 프레임은 직접 확인했으며 원본 바이트를 바꾸지 않았다. 카드 인물 원화와 등급별 프레임 가시성 규칙을 유지한다.

## 동작과 검수

- 가격·확률·발행 한도·차감·지급·판매/획득 잠금은 변경하지 않았다. 서버 변경은 이미지 URL 상수/초기값뿐이다. 운영 DB 쓰기는 하지 않는다.
- 캐시 셸/앱 버전은 `20261016-reverse-call-cards-v1`이다. 대용량 공통 콘텐츠 캐시는 유지하며 변경 이미지에만 새 경로를 사용한다. Windows 실행 파일 버전 변경은 필요하지 않다.
- [브라우저 결과](qa/reverse-call-card-packs-20261016/browser.json): 1440px·390px에서 상점 5종, 도감 13등급, 카드 공개, 하이퍼·용병 리미티드 실제 Pixi 개봉 텍스처를 검수했다. **18개 시나리오 통과**, 이미지 오류·페이지 오류 없음. 가상 계정/API fixture만 사용했고 운영 거래는 0회다.
- [브라우저 재현 스크립트](../tests/reverse-call-card-packs-20261016.browser.mjs). 전체 이미지와 PC/모바일 화면 PNG는 같은 QA 폴더에 보존한다.
- 추가 PC/모바일 주소 호환 검수 2개에서 구 마법카드·확정 큐브 원본 주소와 최적화 주소 4개가 모두 새 이미지로 표시됨을 확인했다. [재현 스크립트](../tests/reverse-call-card-packs-aliases-20261016.browser.mjs).
- 관련 자동 검사는 14종 자산/해시·구 주소 연결·팩 picture source·13등급 카드 렌더·개봉 번들 및 기존 슈퍼스타/하이퍼 UI 계약을 선택했다. 공통 V3 헤더 영향에 따라 기존 전투 진입 검사와 worker 컴파일도 scoped 배포에서 실행한다.
- 활성 JS 등 변경 스크립트 50개의 구문 검사를 통과했다. 사용하지 않는 루트 `app.js`는 작업 전 HEAD부터 `Illegal return statement`가 있으며 이번 이미지/표시 수정과 무관하다. 실제 진입점은 `js/app.js`다. 루트 파일의 변경한 팩 렌더 함수는 별도 VM 검수에 포함했다.

## 배포

코드 커밋·원격 반영 후 `npm run deploy:production -- --scoped`를 실행하고 운영 파일 해시 및 Windows 리소스 목록을 확인한다. 결과는 완료 후 이 절과 `docs/qa/reverse-call-card-packs-20261016/deployment.json`에 기록한다.
