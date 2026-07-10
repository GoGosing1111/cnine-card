# CNINE Card CMS 기반 설계

관리자 등록 흐름: 이미지 업로드 → 멤버 선택 → 카드명 입력 → 등급 선택 → 초점 위치 조정 → 등록.

향후 Cloudflare Pages Functions + D1/R2 연결 시 `card.schema.json` 필드를 그대로 사용한다.

- 이미지: Cloudflare R2 저장
- 카드 데이터: D1 `cards` 테이블 저장
- `enabled=false`: 삭제하지 않고 카드팩/도감에서 비활성화
- 멤버명은 폴더명과 별도로 DB에서 관리
- focusX/focusY로 가로·세로·정사각 사진의 중심 위치 조정
