# V2048 보스 SD · 전용 스킬

## 적용 범위

- 마이트 가이(몬스터 73): `assets/tower/GAI.jpg` 원화 유지, 별도 투명 SD 연결. 전용기는 **팔문둔갑 · 야가이**.
- 센쥬 하시라마(몬스터 74): `assets/tower/SENJU.jpg` 원화 유지, 별도 투명 SD 연결. 전용기는 **목둔 · 목룡 강림**.
- FUR 이예준(`CN-346F8DB0DEB84D41`): `assets/cards/special/chulgu-fur.webp` 원화 유지, 별도 정장 SD 연결. 멤버명·등급·소유 수량은 변경하지 않는다.
- 붕괴 코어 최종 보스: 표시명 **유하바하**, 원화 `assets/tower/uhabha.jpg`, 별도 전투 SD. 영수증·시도 식별자인 `CORE_ARCHEON`은 호환성을 위해 유지한다. 중간 세 코어는 기존 코어 SD를 유지한다.

## 전투 계약

- 기존 71/72 보스의 CMS 스킬 피해 설정은 70%, 가이 80%, 하시라마 90%. 신규 둘의 기존 80/90 값을 보존하며 이름·설명만 전용기로 갱신한다.
- 해당 퍼센트는 기존 서버 피해식의 입력값이다. 실제 최종 피해는 전투 보정에 따라 달라진다. 클라이언트가 별도로 피해를 재계산하거나 중복 적용하지 않는다.
- 실재 RGBA 12프레임 아틀라스 2종, PixiJS `AnimatedSprite`, GSAP 타임라인. 6번 충돌 프레임과 서버 피해 반영을 가이 0.96초 / 하시라마 1.12초에 맞춘다.
- 가이는 붉은 용의 돌진, 하시라마는 목룡·뿌리의 지면 분출. 기존 승인된 물성 보스 효과음을 재사용하며 합성음을 추가하지 않는다.
- reduced-motion에서는 이동 잔상·카메라 흔들림을 억제한다. 전투 종료·재입장 시 이펙트·타임라인·텍스처를 해제한다.
- V3 진형·로스터·원화 카드 프레임은 기존 렌더러를 그대로 사용한다. 붕괴 코어 공개 모드와 보상 잠금은 변경하지 않는다.

## 리소스 및 검증

- 생성 방식: 내장 `image_gen`만 사용. 원본 참조 이미지는 변경하지 않았다.
- SD 경로·프롬프트·원본 및 최종 SHA-256: `docs/boss-resources-v2048-prompts.json`.
- FX 경로: `assets/ui/project-v/fx/apocalypse-signature-v2048/` (원본 시트와 런타임 아틀라스).
- SD 4종: 1350×1350 RGBA 마스터, 사방 최소 72px 안전 여백, 384/768 WebP·AVIF 파생본.
- 독립 검수: `preview/boss-resources-v2048/`. 실제 카드 식별자·원화와 서버 시뮬레이터의 정적 검증 데이터만 사용한다. 게임 API·재화·보상·저장 호출 없음.
- 신규 테스트: `tests/apocalypse-signature-v2048.test.mjs`, `tests/boss-sd-v2048.test.mjs`.
- 브라우저 검수: 기존 탭을 재사용하여 모바일 390px 및 데스크톱 1440px, 두 스킬의 충돌 프레임, 유하바하·FUR 이예준 SD, 원화 카드 도크를 확인했다. 두 서버 피해 이벤트 재생 후 이펙트 잔존 0개.
- 슈퍼스타팩 별도 선행 수정: 30억 10회 개봉을 막던 PostgreSQL legacy INTEGER 비용 필드의 BIGINT 마이그레이션 및 음수 로그 바인딩 수정. 실제 PostgreSQL 회귀 검증은 `tests/superstar-pack-postgres-v2048.test.mjs`.

## 재생성 명령

```
node scripts/build-apocalypse-signature-fx-v2048.mjs
npm run build:v3
npx esbuild preview/boss-resources-v2048/lab.src.js --bundle --minify --format=iife --supported:template-literal=false --outfile=preview/boss-resources-v2048/lab.bundle.js
node scripts/boss-qa-payload-v2048.mjs
npm run test:apocalypse
npm run test:core-raid
npm run test:superstar-pack
```

운영 배포는 검토된 커밋과 원격 main이 일치하는 깨끗한 작업 트리에서 `npm run deploy:production`만 사용한다. 이 명령에 포함된 전체 `release:gate`를 우회하지 않는다.
