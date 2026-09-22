# 비전 마이바흐 6 — 비공개 CMS 등록 / 2026-09-23

## 사용자 확정

- 이름: **비전 마이바흐 6**
- 총 전투력: **500,000**
- 범위: **CMS 등록만, 유저 공개 보류**
- 이미지: 보닛의 중복 배지를 제거한 최종 V4.

## CMS 입력값

```json
{
  "code": "VISION_MAYBACH_6",
  "name": "비전 마이바흐 6",
  "rarity": "MYTHIC",
  "image": "assets/tire/crimson-aura-gullwing-v4.webp",
  "description": "붉은 아우라를 두른 롱노즈 풀튜닝 럭셔리 쿠페.",
  "totalPower": 500000,
  "isActive": false,
  "isPublic": false,
  "sortOrder": 1000
}
```

- 기존 상위 이동수단과 같은 MYTHIC 분류로 준비했다.
- 기존 이동수단 환산식 기준 PVE **450,000**, PVP **50,000**.
- 사용·공개 모두 OFF. 일반 뽑기 활성 0, 확률 0, 중복 파편 0 확인 대상.
- 제작법·프라임 뽑기·블랙미라클·드랍 풀·유저 소유권에 연결하지 않는다.
- 비공개 항목도 관리자 장비·이동수단 CMS의 전체 목록에서는 조회된다.

## 이미지

- 게임용: `assets/tire/crimson-aura-gullwing-v4.webp`, 1672×941, 470,126 bytes, SHA-256 `66c058c34bd5e45452f86c61c267a1f64453bc0b707ce15e4ae7db6ba1bdd3f9`.
- 보존 원본: `assets/tire/crimson-aura-gullwing-v4.png`, 1672×941, 2,407,572 bytes, SHA-256 `c95e38f1ba8c60aadcb6188aad86c8dea2ffca28b1633d40de147eaef80c63c9`.
- 이미지 파일 배포는 유저 도감 공개·획득 ON이 아니다. 런타임 코드는 변경하지 않는다.

## 진행 상태

- CMS 세션이 비로그인 상태라 관리자 로그인 요청 중.
- 실제 운영 등록은 아직 미실행. 성공 응답과 저장된 비공개 상태를 확인하기 전 완료로 보고하지 않는다.
- 이미지 전용 배포는 직전 운영 `bc7846bfc246ff13c0405c296b786aa11385b484` 기준 `npm run deploy:production -- --assets-only` 경로를 사용한다.
