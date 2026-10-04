# 흑금 기사 / 백호멸진 검수 리소스
사용자 원본을 보존한 최종 슈트 제작안이다. 명칭은 가칭이며 **시각 승인 대기 / 운영 OFF**다.

## 최신 방향
2026-10-05 후속 사용자: “빛 반사되는 색감 빼야할거같은데 그리고 발테르 처럼 주변 광원효과 어올리는색 추천해봐 온몸을 휘감고 뒤에 광원효과도 넣어”. **현재 표시는 V2의 차분한 금속 재질 + 전신 오라**다. 기존 원화 형태·갑주·검·44개 동작 PNG는 그대로 보존하고, Pixi 표시 재질에서 금속 주변의 흰 반사광을 낮춘다. 원본 PNG에 무광을 구워 넣은 리소스로 오해하지 않는다. 반사광 완화 체크를 해제하면 원본 표시로 비교할 수 있다.

추천은 **진홍 · 샴페인 골드**다. 붉은 망토에 이어지는 진홍 윤곽광과 전신을 감는 기운, 따뜻한 금색 뒤쪽 후광을 쓴다. **청보라 · 백금**, **청록 · 옅은 금빛**은 색상 선택기로 비교한다. 발테르 V17의 승인 레이어 구성을 확인해 현재 동작과 같은 실루엣 18개를 뒤에 배치하고, 새로 생성한 전신 감싸기 12프레임과 뒤쪽 후광 12프레임을 교차 재생한다. 모든 효과는 기존 V3/GSAP 시계에 따른다.

최신 리소스: `assets/atlases/aura-wrap.png`, `assets/atlases/aura-rear.png`; 생성 원본: `assets/sources/fx-aura-wrap-v2.png`, `assets/sources/fx-aura-rear-v2.png`. **내장 image_gen**으로 생성했으며 전체 생성/간격 보정 프롬프트는 [prompts-aura-v2.json](prompts-aura-v2.json), 알파·균등 배율·셀 정렬 기록은 [qa/aura-packing-v2.json](qa/aura-packing-v2.json)에 있다. 새 오라 24프레임을 합쳐 총 FX 156프레임이다. 최초 간격 시안은 제작 이력으로만 보존한다.

V2 실제 화면 검수: PC1440×1000 / 모바일390×844에서 각42개 접점·지면·중단·자세 추적 검사를 통과했다. 세 색상, 반사광 전후, 오라 ON/OFF와 실제 공격·광역기를 확인했다. 전체 모션 영상은20,023,988바이트이며 브라우저에서1425×640으로 정상 디코딩·재생됐다. [qa/browser-review-v2.json](qa/browser-review-v2.json)에 최신 증빙을 모았다. 재질·광원은 사용자 시각 승인 대기다.

V1 스킬 방향은 유지한다.
2026-10-05 사용자: “아니 그 백호를 소환하라는게 아니라;; X슈트 광역기 확인하면 되잖아”.
X-BODY 천룡 강림을 실제 V3에서 재생해 1.84초 돌파와 2.18초 적중을 확인했다. 백호는 **검기로 응축된 얼굴·발톱 형상이 전장을 통과하고 소멸하는 공격 효과**다. 독립 소환 유닛은 없다. 이전 `tiger-*.png` 2×2 신체 시트는 반려 이력이며 매니페스트/프리뷰에서 사용하지 않는다.

## 재생
- [검수 페이지](index.html): 외형·오라 / 대기 / 대시 / 대검 공격 / 삼연참 / 왕관의 처형 / 백호멸진.
- [V2 전체 모션 영상](review-satin-aura-v2.webm), [추천 조합 PC](qa/satin-aura-v2-desktop-crimson.png), [모바일](qa/satin-aura-v2-mobile-crimson.png).
- 대안 비교: [청보라·백금](qa/satin-aura-v2-desktop-violet.png), [청록·옅은 금빛](qa/satin-aura-v2-desktop-teal.png). 반사광만 비교: [원본 표시](qa/satin-aura-v2-material-before.png), [완화 표시](qa/satin-aura-v2-material-after.png).
- [PC 전체 모션 영상](review-desktop.webm), [모바일 광역기 영상](review-mobile.webm).
- [PC 대표 장면](qa/desktop-aoe.png), [모바일 대표 장면](qa/mobile-aoe.png).
- 0.25× · 0.5× · 1× · 2×, 일시정지, 시간 이동, 다음 적중, 중단, FX OFF, 장면/영상 저장.
- 기존 V3 Pixi/GSAP와 연속 몬스터 전장을 사용한다. 기존 승인 야간 전장 배경만 프리뷰에서 선택한다. 타격은 시각 검수이며 서버 피해나 보상을 계산하지 않는다.

## 제작 11단계
1. **원본 고정**: `assets/sources/knight-approved-20261005.png`, SHA-256 `02ccd3d717c94cd001c538bb8a08cb9272fa1e7cae512e01f12a31b32f68d236`. 재첨부 “그냥 이대로 해라”의 형태를 보존한다. 이후 반사광 완화·전신/뒤쪽 광원 요청을 표시 재질과 별도 FX에 적용했다.
2. **안무**: `motion.mjs`에 준비/접근/베기/적중 정지/도약/착지/회수와 광역기 5대상 타이밍을 기록했다.
3. **몸 동작**: 실제 관절 동작 2×2 시트 11장, 총44프레임. 성인 비율 유지. 대기4, 대시8, 공격8, 콤보8, 스킬8, 광역기8.
4. **검 원본 잠금**: `sword-lock.json`→`extract-weapon.mjs`. 원본과 같은 RGBA 픽셀146,011개. `source-blade.png` SHA-256 `1b8304bf4c5af1b437e38e6b62932d57eb61ef64d9771aafb599711fdd42559e`. 균등 확대/축소·회전·이동만 사용했다.
5. **독립 FX**: 대시, 검격, 타격, 충전, 처형 검기, 파열, 지면파 + 백호 응축/돌파/발톱 충돌/지면 잔향. 11시트×12 =132프레임. V2 전신/뒤쪽 오라 2시트×12를 더해 총156프레임. 생성된 래스터의 모양이 순서에 따라 변한다.
6. **정합/패킹**: `pose-registration.json`의 발·손잡이와 검 끝을 기준으로768px 셀 아틀라스를 구성했다. 웅크린 자세를 서 있는 높이까지 확대하지 않는다. 신체·검 외곽 여백과 FX 셀 경계를 검사했다.
7. **타격점**: 칼날 선분이 대상 몸통을 통과한다. 수평 베기의 검 각도를 하향30도로 조절해 낮은 몬스터도 통과하도록 했다. 도약 구간만 공중 높이가 있으며 지면 꽂기는 바닥 아래 칼날을 가린다.
8. **공용 V3**: `source/preview.js`, `source/KnightFX.js`. 현재 공유 엔진과 native continuous encounter를 번들링한다. Pixi1개/GSAP1개, 공유 엔진에 등록하는 연출 시계1개.
9. **실제 검수**: PC1440×1000와 모바일390×844에서 칼날 적중, 다섯 대상의 배치·표시, 착지, 중단 정리, 배속, FX OFF를 확인했다. `qa/runtime-desktop.json`, `qa/runtime-mobile.json`은 모두 통과했으며, 조작·영상 재생 확인은 `qa/browser-review.json`에 기록했다. `qa/assets-report.json`의 FX 셀 경계 경고는 0건이다.
10. **원본/기록**: 생성 원본, 비채택 이력, 전체 프롬프트 `prompts.json`과 최종 충돌 효과 간격 보정 `prompt-impact-spacing-final.json`, 매니페스트, 패킹 스크립트, 영상/검사 결과를 함께 보존한다. 이미지는 **내장 image_gen**으로 생성했고 Sharp는 승인된 원본 검 픽셀 추출/균등 합성/아틀라스 패킹에만 사용했다.
11. **시각 검수 분리**: 원화 채택은 모션·FX 최종 승인과 다르다. 사용자 최종 시각 승인 대기. CMS·획득·장착·게임 스킬 등록은 하지 않는다.

## 재현
```powershell
node preview/battle-suit-crimson-gold-knight-20261005-v1/extract-weapon.mjs
node preview/battle-suit-crimson-gold-knight-20261005-v1/pack-assets.mjs
node preview/battle-suit-crimson-gold-knight-20261005-v1/pack-aura.mjs
node preview/battle-suit-crimson-gold-knight-20261005-v1/build.mjs
node preview/battle-suit-crimson-gold-knight-20261005-v1/qa-assets.mjs
node preview/battle-suit-crimson-gold-knight-20261005-v1/serve.mjs
```
서버 포트8991. UI의 “현재 전장 검증”과 “검증 JSON 저장”으로 실제 V3 결과를 남긴다.

첫 공개 주소 확인에서 초기 전장 로딩이 공용 14초 제한을 넘는 현상을 확인했다. 빌려온 전장 fixture의 Z-BODY 지정 때문에 사용하지 않는 Z 모션·광역기까지 로딩하던 부분을 제거하고, 검수 전용 코드와 승인 원본을 직접 지정했다. 숨겨진 문서는 표시될 때 초기화하도록 보호했다. 공용 엔진과 제한 시간은 변경하지 않았다. 수정 후 PC·모바일 접점/지면/중단/5대상 검사 각각 38건을 다시 통과했으며 작화·동작·효과는 동일하다.

## 배포 범위
V2 범위는 이 프리뷰 폴더의 재질·오라·비교 UI와 증빙뿐이다. 실제 직전 배포 `c198f17d-cd71-4349-9237-558da912961a`의 소스는 `16a261586bcf5e138dc4fd92ce5949659bc4411f`다. 이후 main의 문서/테스트 커밋이 자산 전용 허용 경로를 벗어나므로 이번에도 `--scoped`와 이 프리뷰의 `qa-assets.mjs`를 사용한다. 게임 공용 런타임·경제·CMS·DB 변경은 없다. 자세한 범위는 [release-satin-aura-v2.json](release-satin-aura-v2.json)에 기록한다. 사용자 시각 승인·운영 활성화는 보류한다.

아래는 V1 배포 이력이다.
새 검수 프리뷰 폴더만 추가한다. 자산 전용 배포이며 기능 활성화가 아니다. 직전 운영 커밋 `d9ff3df0643bf7a0580d30a99fba604b6983aeee`는 Cloudflare 배포335ea8bd 목록으로 확인했다. 최신 main을 fast-forward로 받아 다른 작업의 배포 내용을 보존한다. 관련 자산·실제 화면 검사만 수행하고 `npm run deploy:production -- --assets-only` 경로를 사용한다.

최초 공개 배포: `8f92b34ff073fe4fcd114ac1771b18f0f79c0e1e`, `d96705f6-7e6e-4032-ab45-d690072ccef5`. 페이지·매니페스트·번들·승인 원본의 운영/로컬 해시 일치와 영상 HTTP200을 확인했다. 후속 로딩 수정은 이 커밋을 기준으로 한다. 최신 main에 다른 작업의 `scripts/ops/` 기록이 포함되어 자산 전용 허용 경로를 벗어나므로 `--scoped`를 사용한다. 선택 검사는 이번 폴더의 `qa-assets.mjs`이며 공용 전투·인증·경제·DB 코드는 변경하지 않았다. PC·모바일 실전장 각38개 검사 통과 기록을 유지한다.
