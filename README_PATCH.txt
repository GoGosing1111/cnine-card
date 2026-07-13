CNINE LIMITED -> MA 이동 수정

- CMS에서 LIMITED가 아닌 등급을 선택하면 한정 수량 입력을 자동으로 비웁니다.
- 서버는 LIMITED가 아닌 카드 저장 시 limited_total을 NULL로 정리합니다.
- LIMITED는 1장 이상의 한정 수량이 있어야 저장됩니다.
- 기존 D1 구조와 API 경로는 변경하지 않습니다.
