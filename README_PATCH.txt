CNINE 유저 화면 로딩 최적화 v9.60

- 초기 service/status, cards, packs 병렬 호출
- 별도 health 요청 제거
- cards 2분 / packs 1분 / pvp/config 30초 메모리 캐시
- 동일 GET 요청 진행 중 중복 호출 합치기
- 유저 정보·뽑기·전투·보상 요청은 캐시하지 않음
- 초기 SSR/MA/FUR 배경 preload 제거
- 레이드 대기 5초 / 전투 2초 폴링
- 백그라운드 탭에서 레이드 폴링 중지, 복귀 시 재개
- D1 및 API 경로 변경 없음
