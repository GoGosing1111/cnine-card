# 서든어택 숲켓몬배 대회 포스터

- 사용자 제공 1024×1536 포스터의 중앙 제목과 로고를 교체한 시안이다. 하단 대회 안내·진행 방식·시상 내용·핵심 포인트는 원본 픽셀 그대로 보존했다.
- `edited-background.png`: ImageGen으로 기존 제목·슬로건만 지우고 빈 대회 명판을 만든 그림. 적용 경계는 `build.mjs`에서 y=530–590으로 부드럽게 섞는다.
- `sudden-attack-official-logo.png`: [넥슨게임즈 서든어택 소개 페이지](https://www.nexongames.co.kr/game/sudden_attack.php)의 [공식 로고 이미지](https://www.nexongames.co.kr/img/sub/c_image.png). 투명 원본을 별도 계층으로 합성했다.
- `build.mjs`와 `title-overlay.svg`: 검증된 한글 시스템 폰트로 `서든어택 숲켓몬배 대회`를 정확하게 조판한다. `숲`의 ㅍ 받침을 포함한 글자 형태는 최종 PNG에서 확대 확인한다.
- 최종 이미지: `sudden-attack-soopketmon-cup-poster-v1.png`. `qa.json`은 크기·문구·하단 픽셀 보존 검사를 기록한다.
- 독립 포스터 산출물이다. 게임 화면이나 운영 공지에는 자동 연결하지 않는다.
