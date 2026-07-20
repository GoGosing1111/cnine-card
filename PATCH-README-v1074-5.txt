CNINE CARD V1074-5 WAGO RECENT REWARD HISTORY PATCH

기준: V1074-4 누적 패치 이후

변경:
- 와고 확장프로그램 최근 지급 내역 API에 메시지 수령 상태 추가
- 신규 지급 영수증에 message_id 연결
- 기존 영수증은 상태 미확인으로 안전 표시
- wago_extension_reward_receipts에 message_id 컬럼이 없을 때만 ALTER TABLE ADD COLUMN 안전 실행

D1 안전:
- DROP TABLE 없음
- RENAME TABLE 없음
- 기존 데이터 삭제 없음
- 기존 테이블 재생성 없음
- 신규 nullable 컬럼만 존재 여부 확인 후 추가
