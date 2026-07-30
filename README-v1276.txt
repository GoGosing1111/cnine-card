숲켓몬 v1276 - 2단계 인증 완료 유저 보상 메시지 확장

- CMS 보상 종류: 코인 / 마스터의 별 / 프리미엄 큐브 / 장비 보급상자
- 유저가 메시지에서 수령할 때만 실제 지급
- 메시지 보상 영수증으로 중복 수령 차단
- 인벤토리 보상은 cnine_user_inventory 및 inventory_logs에 기록
- 일괄 발송은 campaign_key 기반 INSERT SELECT로 처리해 대량 인증자에서도 사용자별 반복 쓰기를 제거
- 신규 안전 컬럼: user_messages.campaign_key
- 신규 안전 인덱스 및 app_meta marker만 추가
