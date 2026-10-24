# 흑익 보스 손잡이 정리 · 2026-10-24

사용자 요청: 일러스트 보니까 손 뒤에 손잡이 꺽여있는데 손잡이 줄여서 그냥 없애

- 손 뒤로 튀어나온 굽은 후방 손잡이와 가시 끝 장식을 제거해 뒤쪽 손 바로 끝에서 마무리한다. 칼날·가드·양손 파지·투구·날개·구도를 유지하는 국소 편집이다. 내장 image_gen 도구를 사용했다.
- 수정 전 PNG와 생성된 수정 PNG를 assets/raids/blackwing-20261024/originals/에 바이트 그대로 보존했다. 표시용 boss-art.webp는 1536×1024, quality 90 형식 변환본이다. 프롬프트·출처·SHA-256은 같은 자산 폴더 manifest.json의 illustrationEdit와 prompts.json에 있다.
- 기존 로비 원화와 전투 HUD 초상화의 이미지 URL에 캐시 버전을 반영했다. 12프레임 전투 본체·스킬·공통 UI·전투 수치·TEST/보상 잠금은 변경하지 않았다.
- 검수는 해당 로비의 PC/모바일 이미지 표시와 기존 조작에 한정한다. 기존 blackwing-raid-20261024.browser.mjs의 UI 전용 경로로 검사하며 전체 전투 검사는 반복하지 않는다.
- 실제 배포 폴더는 C:/Users/User/Downloads/cnine-z-body-sword-20260918/site. 산출물은 C:/Users/User/Downloads/upload/cnine-card/output/blackwing-hilt-fix-20261024/.
