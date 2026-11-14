# 산타걸 나무늘봉순 v8 승인 원화 교체

사용자가 마지막 한쪽 포니테일 수정본을 승인하고 산타걸 나무늘봉순 리소스 교체를 지시했다. 얼굴·피부·머리 크기와 신체 비율은 승인본 그대로다.

- `approved-v8.png`: 승인 원본, SHA-256 `b7cfe135152e8bb9fe8560c1a283ff7128ac99a8967ddbeb48ab6ec6f140aabb`.
- `equipment-v8.png`: built-in ImageGen 배경 분리 알파와 승인 원본 RGB. 원본 RGB 변경 채널 0, 생성 알파 변경 픽셀 0. 얼굴을 재생성하지 않는다.
- `prompt-v8-hair.txt`, `prompt-extraction.txt`: 제작과 배경 분리 프롬프트.
- 런타임은 기존 `assets/ui/avatars-v1/santa-20261114/bongsoon-{lobby-1024,lobby-640,equipment-640}.webp` 세 경로를 교체한다. API URL `?v=b7cfe135-v8`로 기존 캐시를 갱신한다.
- 이미지 합계 441,720 → 420,222 bytes, 21,498 bytes(4.9%) 감소. 640px 투명 전신 67,580 → 59,884 bytes.
- 관련 기존 자산 검사 `node --test --test-name-pattern='only site-ready' tests/avatar-santa-options-20261114.test.mjs`: 1개 통과. 다른 산타걸 9개 파일의 SHA-256 보존 확인.
- 이미지·승인 문서만 바뀌므로 `ASSET_DEPLOY_BASE=f65b9933bca39ec6639bc32c71b64949289ed217 npm run deploy:production -- --assets-only`. API Worker는 변경하지 않는다. 신규 공개·판매·계정 지급은 이 작업 범위가 아니다.

운영 적용은 `ops:santa-bongsoon:approved-v8:20261114:resource-replace:v1` 영수증으로 중복 실행을 방지한다. 기존 옵션·다른 아바타·소유·장착·공개 설정을 전후 대조하고, 최종 운영 결과와 화면 성능은 `completion.json`에 기록한다.
