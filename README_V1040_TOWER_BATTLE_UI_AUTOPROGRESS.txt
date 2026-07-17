CNINE CARD V1040 - INFINITE TOWER BATTLE/UI FIX (CUMULATIVE)

기준: V1039 누적 패치

수정 내용
1. PVE 상단 무한의탑 탭 중복 생성 방지
   - 비동기 MutationObserver 중복 실행 잠금
   - 이미 생성된 중복 탭/중복 뷰 자동 정리
2. 무한의탑 전투 화면 재구축
   - 기존 PVE battle-stage, battle-hud, battle-arena, 전투 카드, HP바, 공격/피격/승패 연출을 실제 재사용
   - 무한의탑 층 진행 HUD와 보스층 인트로만 추가
   - 궁극기 관련 기능은 사용하지 않음
3. 자동진행 ON/OFF 추가
   - 승리 시 다음 층 자동 도전
   - 패배/오류 시 자동 중단
   - 유저 브라우저에 마지막 선택 저장
4. PVE 덱 편성 버튼 재디자인
5. 현재 층 도전 버튼 및 모바일 레이아웃 재정리

DB 변경 없음
기존 API 및 기존 누적 기능 유지
