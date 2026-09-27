# 도박왕 칭호

- 최종 사용자 설정: 승부예측 누적 적중 1,000회, 장착 전투력 +60,000.
- 라이브 `character-loadout-v2.js`를 그대로 사용하는 시각 검수 화면이다. 프리뷰의 보유·장착 변경은 로컬 fixture에만 적용된다.
- `?locked=1`은 822/1,000회 진행도와 획득 전 상태, 기본 화면은 획득·장착 상태를 보여 준다.
- 서버 집계는 기존 정산 기록 전체를 사용한다. `SETTLED` 경기와 참여 중 정답 선택·지급액 양수인 참여만 세며 무효·환불·미정산·다른 유저 기록은 제외한다. 추가 베팅 금액과 일별 집계는 조건에 영향을 주지 않는다.
- 장비 화면 진입 시 기존 `character/title/sync`를 통해 영구 소유권을 자동 해금한다. 장착한 칭호 한 개의 전투력만 적용한다.
- 제작 도구: 내장 `image_gen`, 실제 투명 배경. 원본은 `gambling-king-source.png`, 런타임 자산은 `assets/ui/titles/gambling-king-v1.webp`(512×512). 알파·해시는 `asset.json`에 기록했다. 원본은 변경하지 않고 WebP 배포용 크기/형식만 변환했다.
- PC 1706×1200, 모바일 391×844 CSS viewport에서 이미지 로딩, 가로 넘침 없음, 60,000 표시, 장착·해제와 822/1,000 진행도를 확인했다. 브라우저 오류 0건. 증빙: `C:/Users/User/.codex/worktrees/qa-gambling-king-20260928/`.

## 최종 생성 프롬프트

Use case: stylized-concept. Asset type: premium fantasy RPG achievement title insignia, one isolated square icon. Primary request: create a luxurious Gambling King emblem for a game achievement earned by correctly predicting 1000 matches. Subject: a commanding sculpted gold crown above a single large black enamel spade with a luminous emerald inset, framed by two restrained gold laurel branches and a deep emerald velvet ribbon, with a small elegant playing-card fan tucked behind the spade. Sophisticated hand-painted 2D RPG UI art, polished gold planes, crisp bold silhouette readable at 32 pixels, emerald-black-and-antique-gold palette. Front-facing nearly symmetrical composition centered in a square with generous transparent padding, all shapes fully visible. Only the emblem, actual transparent background. No background scene, no glow cloud, no typography, no letters, no numbers, no watermark, no UI frame, no human.
