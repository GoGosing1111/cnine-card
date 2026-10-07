# SX슈트 궁극기 V3 · 창천멸진

2026-10-07. **새 궁극기 사용자 시각 승인 대기**, `runtimeEnabled:false`. 기존 회전 베기 궁극기는 반려됐다. 사용자가 제시한 청룡 또는 거대 검신 광역기 중 **거대한 청색 대검이 지면을 강타하는 방향**으로 제작했다. 실제 피해·보상·계정 상태를 쓰지 않는 무음 프리뷰다.

- [전투 프리뷰](http://127.0.0.1:8975/preview/battle-suit-sx-v1/ultimate-v3/)
- [PC 영상](review-desktop-v3.webm) · [모바일 영상](review-mobile-v3.webm)
- [PC 실제 영상 프레임](qa/video/filmstrip-desktop.png) · [모바일 실제 영상 프레임](qa/video/filmstrip-mobile.png)
- [반려·재검수 기록](rejection-and-review-20261007.json) · [승인된 오라·대시·검무](../approval-aura-dash-skill-20261007.json)

## 구성

총 5.7초. 0.38초부터 적 진형 중앙에 검압이 모이고, 캐릭터 높이의 3.28배인 청색 검신이 공중에 형성된다. 1.72초부터 가속 낙하해 **2.02초에 지면을 강타**한다. 폭발·지면 파열·두 차례의 충격파가 전열과 후열 전체로 퍼진다. 5개 대상은 파동이 도달하는 거리별 시각에 반응하고, 검신과 파열이 소멸한 뒤 원래 위치로 복귀한다.

검신은 손잡이부터 끝까지 하나의 강체 이미지다. 휘거나 늘리지 않고 균일 배율과 이동으로 낙하하며, 검끝이 땅에 박힌 동안 지면 마스크로 접점을 고정한다. 본체는 기존의 머리·목·어깨·손·대검이 이어진 전신 자세를 사용하고, 원래 색감과 긴 다리 비율을 유지한다.

기존 X슈트 계열의 공용 V3 전장·PixiJS·GSAP 시계를 사용한다. `SXUltimateFX`가 궁극기만 별도로 담당하며 승인된 `SXBodyFX.js`, `motion.mjs`, `manifest.json`, 전신·오라·검무 자산과 타이밍은 바꾸지 않았다. 기존 프리뷰의 궁극기 메뉴만 이 별도 페이지로 연결했다.

실제 V3의 5개 몬스터 SD·진형·카드 도크를 로컬 검수 데이터로 배치한다. `preview/z-body-thunder-v3/fixtures.json`의 multi 장면을 읽고 프리뷰 어댑터가 단일 사냥 보스 선택을 우회한다. 공용 전투 엔진과 운영 API는 수정하지 않았다. 대상 반응은 시각 연출이며 전투 피해 구현·밸런스 검증을 뜻하지 않는다.

## 이미지 생성과 보존

내장 **image_gen**으로 [거대 검신](assets/source/blade.png), [지면 폭발](assets/source/eruption.png), [충격파](assets/source/ring.png)를 제작했다. 실제 프롬프트·참조·생성 원본 경로는 [prompts.json](prompts.json), PNG 크기·해시·기준점은 [manifest.json](manifest.json)에 기록했다. 청룡 리소스는 생성하지 않았다.

모두 실제 알파가 있는 PNG다. 원본을 보존하고 효과 두 장만 투명 셀 여백을 두어 패킹했다. 12프레임씩 총 24프레임을 보존하지만 **폭발 1~8번, 충격파 1~12번의 20프레임만 사용**한다. 폭발 9~12번에는 원본 시트 위쪽 경계 조각이 있어 실행에서 제외했다. 폭발은 깨끗한 8번을 유지한 채 알파로 소멸한다. 새 효과는 본체 이미지를 재색칠하지 않는 별도 계층이다.

승인 정지 원본 SHA-256: `0ecc36640e457a5ef33f5d5d34dfaac4c548504375f732dea0d456609a5bb73b`. 오라·대시·검무 부분 승인 기록의 96개 파일/구현 해시 참조와 세 모드의 타이밍이 그대로임을 관련 테스트로 확인했다.

## 검수

- 관련 테스트 **3/3 통과**: 승인본 보존, 새 이미지의 알파·직선 검축·패킹, 낙하/접점/광역 도달/전신 출처와 종료 상태.
- [PC·모바일 보고서](qa/verified/browser-report.json): 1440×1040 / 390×844, 각 13개 시점. 적 5개 표시와 반응, 캐릭터·칭호·대상 화면 범위, 원본 틴트·균일 배율·검신 오라 접점, 배속·일시정지·OFF·중단·화면 이탈·해제 확인. 콘솔/리소스 오류와 가로 넘침 0.
- [실제 영상 디코딩](qa/video/video-report.json): PC 1440×748, 모바일 390×613, 각각 약 6.27초. 실제 디코딩된 12개 프레임씩 확인했다. PC·모바일 본체 단독 자세도 별도로 확인했다.
- `qa/verified/`의 화면과 `qa/video/`의 디코딩 결과가 현재 증거다. 실패·중간 캡처는 로컬 보존하되 커밋에서 제외했다. 기술 검수는 사용자 최종 시각 승인을 대신하지 않는다.

## 실행

저장소 루트에서 실행한다. 승인된 기존 번들은 다시 만들지 않는다.

```powershell
node preview/battle-suit-sx-v1/serve.mjs
# 새 궁극기 구현을 변경한 경우에만
node preview/battle-suit-sx-v1/ultimate-v3/build.mjs
node --test preview/battle-suit-sx-v1/ultimate-v3/qa.test.mjs
node preview/battle-suit-sx-v1/ultimate-v3/qa-browser.mjs
node preview/battle-suit-sx-v1/ultimate-v3/qa-video.mjs
```

이번 범위는 `[CF-Pages-Skip]` 프리뷰 커밋·원격 보존까지다. CMS·제작식·능력치·계정 지급·운영 배포·활성화는 포함하지 않는다.
