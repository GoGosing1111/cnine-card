CNINE CARD v1250 — 장비창 배경 원본 수정 및 슬롯 정렬

1. 기존 프레임 이미지에 박혀 있던 고정 장비명 제거
   - 현대식 무기
   - 듀얼디스크
   - 현대식 상의
   - 현대식 하의
   - 현대식 신발

2. 해당 위치를 불투명한 빈 장비명 플레이트로 직접 수정
   - CSS 가림막에 의존하지 않음
   - 실제 장비명만 HTML로 출력

3. 원본 941×1672 프레임 좌표를 기준으로 슬롯 재계산
   - 무기 / 장신구 / 상의 / 하의 / 신발 개별 좌표
   - 512×512 이미지가 슬롯 내부를 100% 채움
   - object-fit: cover
   - 오른쪽 상의·하의·신발 공백 제거

4. v1249 기능 유지
   - 장비·칭호 즉시 장착
   - 장비 보급상자
   - 중복 장비 카드 조각 자동 변환

적용 파일:
- index.html
- assets/ui/equipment-screen-frame-clean-v1250.png
- css/equipment-v1250.css
- css/supply-box-v1249.css
- js/equipment-v1250.js
- js/app.js
- functions/_equipment.js
