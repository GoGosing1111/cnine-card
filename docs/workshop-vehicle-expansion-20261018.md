# 비전 마이바흐 6·아스트라 - 볼트 제작 연출

사용자 요청: “솔라리스 제작 확인해서 비전 마이바흐 6 랑 아스트라 - 볼트 제작연출 추가해놔”. 기존 솔라리스의 실제 구현 `preview/workshop-assembly-v1/source/AssemblyFilm.js`를 확인해 같은 13.4초 차량 조립 공정에 두 모델을 추가했다.

## 적용

- 비전 마이바흐 6: 차체·엔진·휠 → 외장 → 두 걸윙 도어 순차 체결 → 용접·검사 → 붉은 아우라와 시동 → 출고 이동.
- 아스트라 - 볼트: 차체·엔진·휠 → 은빛 외장 → 상부·측면 볼트 반응로 순차 체결 → 용접·검사 → 청색 코어 점화 → 출고 이동.
- 실패는 기존 서버 실패 결과로 끝나며 성공 아우라·출고 이동을 재생하지 않는다. 실제 제작 버튼은 기존 `workshop-v1881.js`를 그대로 사용한다.
- 기존 원화 경로로 라이브 연출을 선택한다. 마이바흐 V4 WebP/PNG와 아스트라 aura V2에만 연결하며 이름만 같은 다른 차량은 연결하지 않는다. 출력이 없는 실패에도 같은 모델을 표시한다.
- 제작식·재료·가격·확률·차량 지급·획득 경로·CMS 공개/ON 값과 서버 거래는 변경하지 않았다. 애니메이션은 이미 확정된 영수증을 공개하며 일시정지·건너뛰기·닫기·재생으로 제작 API를 추가 호출하지 않는다.

## 리소스

내장 `image_gen`으로 두 원화의 연출 전용 투명 파생본과 자동차 제작용 프레임/버튼 아틀라스를 만들었다. 차고 원본은 수정하지 않았으며 생성 PNG를 바이트 그대로 보존하고, 배포용 무손실 WebP와 UI 아틀라스 분리만 수행했다.

- 색인·SHA-256: `preview/workshop-assembly-v1/vehicle-expansion-20261018-assets.json`
- 최종 프롬프트·입력·생성 원본 경로: `preview/workshop-assembly-v1/vehicle-expansion-20261018-prompts.json`
- 실제 자산: `preview/workshop-assembly-v1/assets/vehicles-20261018/`
- 기존 `vehicle-bay.png`, 로봇 팔, 프레임·엔진 모듈, 녹음된 체결·시동·실패 효과음을 같은 차량 제작 콘텐츠 안에서 재사용한다. 새 별도 재생 시계나 합성 음원은 추가하지 않는다.
- 새 두 차량의 라이브 창에 전용 이미지 프레임과 버튼을 연결한다. 동적 문구·금액은 DOM이다. 최종 결과는 차량 아래 별도 행에 표시해 PC·모바일 모두 원화와 겹치지 않게 했다.

## 검수

`tests/workshop-vehicle-expansion-20261018.browser.mjs`로 1440×1000 PC와 390×844 모바일에서 두 모델을 확인했다. 실제 제작 클라이언트에 메모리 영수증을 제공했으며 운영 재화는 사용하지 않았다. 각 모델 PC 성공/자연 종료, 모바일 실패/건너뛰기, 키보드·터치 제작, 일시정지/계속 재생, 닫기 후 제작 버튼 복귀, 타임라인 폐기를 확인했다. 각 시나리오 모의 제작 1회, 실제 API 쓰기 0회, 브라우저 오류·리소스 404는 0건이다.

초기 PC 결과창이 차량 하단을 가리는 것을 확인해 결과 행을 분리했다. 이 CSS 변경 뒤에는 두 모델 PC·모바일 결과 화면만 재확인했다. 별도로 모바일 동작 줄이기에서 애니메이션 없이 저장된 결과·원래 차량 이미지를 표시하고 Escape로 닫히는 것을 확인했다. 기술 검수는 사용자 시각 최종 승인으로 기록하지 않는다.

화면/보고서: `docs/qa/workshop-vehicle-expansion-20261018/`. 배포 관련 회귀는 `tests/workshop-assembly-live-v2073.test.mjs`, `tests/workshop-assembly-preview-v1.test.mjs` 두 파일만 선택한다. 기존 모델, 성공/실패 영수증, 실제 GSAP 타임라인, alpha/원화 해시, 번들·로더 연결을 검증한다.

## 배포

2026-10-18 라이브 반영 완료. 직전 운영 Pages `72706b93`, 소스 `5c09f9a2b`를 확인한 뒤 관련 두 테스트 파일을 선택해 `npm run deploy:production -- --scoped`로 배포했다. **21개 검사 모두 통과**, 출시·캐시 태그와 Hyperdrive 쿼리 캐시 OFF 검사도 통과했다. 전체 게임 검사는 실행하지 않았다.

- 배포 소스: `691cd0797b375a7e37f0f2f8e0751e229d8ae3fe`
- Pages: `https://22f4efca.cnine-card.pages.dev` / 운영: `https://cnine-card.pages.dev`
- API Runtime: `e97b405d-2ed4-4e46-ab88-6b994bd23134`
- Scheduler: `cbb2fda3-2b6c-415b-9fed-1addeceb72de`
- Pages 자산: 19,975개. 실제 차고 원화와 다른 콘텐츠 자산은 보존했다.
- 메인 앱·서비스워커 및 조립 로더 태그: `20261018-vehicle-assembly-v1`.

운영 메인 앱/서비스워커, 조립 번들/CSS, 새 WebP 4종 등 11개 파일을 HTTP 200 및 SHA-256으로 확인했다. 운영 주소의 실제 라이브 연출 코드에 모의 영수증을 제공해 마이바흐 1440×1000, 아스트라 390×844의 성공 결과·차량/문구 분리·닫기 후 타임라인 폐기를 짧게 확인했다. 운영 제작 API·계정 재화를 사용한 검수가 아니다. 브라우저 오류와 실제 API 쓰기는 0건이다. 상세 결과는 `docs/qa/workshop-vehicle-expansion-20261018/production.json`에 보존한다.

검수 링크: [비전 마이바흐 6](https://cnine-card.pages.dev/preview/workshop-assembly-v1/?mode=vehicle&item=maybach&play=1), [아스트라 - 볼트](https://cnine-card.pages.dev/preview/workshop-assembly-v1/?mode=vehicle&item=astra&play=1). 이 검수 페이지는 재화 소모가 없다.
