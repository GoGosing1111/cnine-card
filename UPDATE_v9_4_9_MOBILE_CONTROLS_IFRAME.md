# v9.4.9 모바일 방향키 / 와고 iframe 표시 수정

- 모바일 방향키 노출 조건을 화면 너비만 보던 방식에서 터치 포인터, hover 지원 여부, maxTouchPoints, visualViewport까지 함께 판별하도록 변경
- 와고 iframe 안에서도 방향키를 강제로 표시하는 `touch-controls-enabled` 상태 추가
- 방향키를 viewport 기준 fixed로 고정하고 safe-area 하단 여백 반영
- 높은 z-index, visibility, opacity, pointer-events를 강제해 다른 UI 뒤에 숨는 문제 수정
- 화면 회전 및 iframe viewport 변화 시 표시 상태 재계산
