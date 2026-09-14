# 철구 × 아이젠 카드 이미지 경로

사용자 요청: 제공 사진을 기반으로 철구 얼굴이 드러나는 아이젠 합성 카드를 제작하고, ‘내가 하늘에 서겠다’ 문구를 넣은 이미지를 업로드해 CMS 입력 경로를 제공한다.

CMS 카드 이미지 경로 입력값:

```text
assets/NEWCARD/chulgu-aizen-v1.png
```

전체 URL:

```text
https://cnine-card.pages.dev/assets/NEWCARD/chulgu-aizen-v1.png
```

- 규격: 1024×1536 PNG, 2:3.
- SHA-256: `D9EDF8EBA0F8752037F975816F6E09D7ADEDAACB219DFB06D9478CBC101DD168`.
- 사용자에게 제시한 이미지와 동일한 원본을 무가공 복사했다.
- 이 작업은 이미지 게시만 수행한다. 카드 ID·등급·획득 확률·보유 카드·운영 카드 등록값은 수정하지 않는다.
- 운영 기준 커밋 `9cba8082`, 배포 `e11ab827`을 바탕으로 이미지와 이 경로 문서만 추가한다.
- `npm run deploy:production`에 포함된 `release:gate` 통과 후 게시하며, 완료 시 실제 이미지 URL의 HTTP 상태·MIME·파일 해시를 확인한다.
