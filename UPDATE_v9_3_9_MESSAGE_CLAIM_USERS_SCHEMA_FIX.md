# v9.3.9 메시지 코인 수령 D1 스키마 핫픽스

- users 테이블에 존재하지 않는 updated_at 컬럼을 갱신하던 SQL 제거
- 코인 수령은 기존 users.coin만 안전하게 증가
- user_message_rewards.claimed_at 1회 처리 유지
- user_messages.hidden_at 처리 후 메시지 자동 숨김 유지
- 기존 테이블 삭제/재생성/데이터 삭제 없음
