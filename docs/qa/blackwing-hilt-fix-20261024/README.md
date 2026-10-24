# 흑익 보스 손잡이 정리 · 2026-10-24

사용자 요청: 일러스트 보니까 손 뒤에 손잡이 꺽여있는데 손잡이 줄여서 그냥 없애

- 손 뒤로 튀어나온 굽은 후방 손잡이와 가시 끝 장식을 제거해 뒤쪽 손 바로 끝에서 마무리한다. 칼날·가드·양손 파지·투구·날개·구도를 유지하는 국소 편집이다. 내장 image_gen 도구를 사용했다.
- 수정 전 PNG와 생성된 수정 PNG를 assets/raids/blackwing-20261024/originals/에 바이트 그대로 보존했다. 표시용 boss-art.webp는 1536×1024, quality 90 형식 변환본이다. 프롬프트·출처·SHA-256은 같은 자산 폴더 manifest.json의 illustrationEdit와 prompts.json에 있다.
- 기존 로비 원화와 전투 HUD 초상화의 이미지 URL에 캐시 버전을 반영했다. 12프레임 전투 본체·스킬·공통 UI·전투 수치·TEST/보상 잠금은 변경하지 않았다.
- 검수는 해당 로비의 PC/모바일 이미지 표시와 기존 조작에 한정한다. 기존 blackwing-raid-20261024.browser.mjs의 UI 전용 경로로 검사하며 전체 전투 검사는 반복하지 않는다.
- 실제 배포 폴더는 C:/Users/User/Downloads/cnine-z-body-sword-20260918/site. 산출물은 C:/Users/User/Downloads/upload/cnine-card/output/blackwing-hilt-fix-20261024/.

## 완료 기록

- 운영 소스 `6238a4c548d57f98051a14364ae3c10a8cbd7cd8`, Pages `0dd316e9-8d08-4c19-bb84-d07e83a0ac0f` 반영 완료. 공개 파일 13개 SHA-256 일치, 캐시 버전이 붙은 실제 보스 이미지 URL도 동일 수정본을 반환한다.
- 실제 게임 index → 레이드 → 흑익 로비에서 PC 1440×1000 / 모바일 390×844 이미지 로딩·역할 선택·공대 조작 통과, 예외/가로 넘침 0. 운영 계정 쓰기 없이 격리된 합성 계정으로 확인했다.
- 확인 시 운영 입장 API는 기존 갤주 방송중 점검으로 MAINTENANCE를 반환한다. 점검·TEST 설정과 보상 정책은 변경하지 않았다.
- 배포 검사 동안 따로 보존한 기존 파일 74개를 원위치 복구하고 길이/SHA-256 전부 일치 확인. 기존 폴더 재사용, 새 의존성 복사본 없음.
- 수정 PNG: assets/raids/blackwing-20261024/originals/boss-art-hilt-short-20261024.png. 표시 WebP SHA-256: d21b4b7316a3448e25a1cbde2460a163925a05bee8dcd18129c2d6b6a1bb2975.
