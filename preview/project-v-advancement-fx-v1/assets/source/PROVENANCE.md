# PROJECT V advancement visual FX provenance

이 문서는 독립 검수 프리뷰가 현재 선택한 전직 시각 이펙트의 원본과 변환 결과를 고정한다. 라이브 PROJECT V V3에는 연결하지 않는다.

- SHATTER, AFTERIMAGE, IMMORTAL은 역할별로 새로 제작한 각성급 V3 원본이다.
- RIPOSTE는 사용자 승인 상태의 V1 원본·아틀라스를 바이트 단위로 보존하며 빌더가 재기록하지 않는다.
- 중단된 V2 시안은 현재 프리뷰 선택 및 런타임 경로에서 사용하지 않는다.
- 오디오는 `assets/audio/PROVENANCE.md`의 녹음·폴리 V1을 그대로 유지한다.

| Effect | Role / concept | Selected source | Source ID | Source SHA-256 | Selected atlas | Atlas PNG SHA-256 | Atlas JSON SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHATTER | attack / awakening-dragon | `assets/source/shatter-awakening-dragon-sheet-black-v3.png` | `exec-1e4393c7-91b0-4f60-b845-146ab82fe33e` | `98EB875D163E03C2B26B557127602673C56D589D3111D47AB2CC047046805958` | `assets/atlases/shatter-advancement-atlas-v3.png` | `4A8D0EAFFACAE0DAC4D747E6BFA7030E15D1F4385A743C0120F8FE031E882D56` | `9C795A5C28B05AEA95330656C6F4FAE6E69CDEF36F55C274CB06A899401DC9E8` |
| RIPOSTE | counter / counter-guard | `assets/source/riposte-counter-guard-sheet-black-v1.png` | `exec-d1575f25-bf09-4eca-ab77-983365d360f8` | `F142262F84FD5CBF6A89A7D9767776A8A6684EDDFF5E9B90B7D234651C791B47` | `assets/atlases/riposte-advancement-atlas-v1.png` | `3D70439BA3063509C71D276FBA0EDB59538532497F4F30FA22D45B5679B56E2C` | `093A5CD203C2424EEA75F6F59A8AB2A08B88385B105F8BC9E1043DA47831E333` |
| AFTERIMAGE | speed / awakening-chrono-falcon | `assets/source/afterimage-awakening-chrono-falcon-sheet-black-v3.png` | `exec-11b4ddf1-f888-4125-b87c-195690c8c245` | `6BAA0F5207B93A35F37FDDC49512D519A5CC9478DC5138FF904FE513C7CF4198` | `assets/atlases/afterimage-advancement-atlas-v3.png` | `DE9A6D015D9BD05C744E416D18F1A195BB5682E34F882F59D24802171D4D4092` | `482D42427A8BD39BCE6DAE2334F46B5BAFBB07917F204D5F777481492626660F` |
| IMMORTAL | heal / awakening-world-tree | `assets/source/immortal-awakening-world-tree-sheet-black-v3.png` | `exec-ea504bc5-479c-4d19-8408-93984ba65182` | `58111C400582EDF9805D2F9A4AC5C59A3F767D2507B334F7F56E8481BDBDCB99` | `assets/atlases/immortal-advancement-atlas-v3.png` | `407554DC1CB9D88A298E5CC015AA1E9D29FB50E8861B21ABBC19771EFE485EFE` | `B10E06999C5424359AC11D0750600FD7A1649249E2B7D78304081510D9B52D77` |

## 변환 계약

- 입력: 1536×1024 RGB PNG, 4×3 그리드. 마지막 1px 행을 제외한 1536×1023을 384×341 셀로 분리한다.
- 검정 무광 제거: RGB 최대값 2 이하는 완전 투명, 알파 지수 0.86으로 색을 복원한다.
- 출력: 프레임당 512×455, 12프레임, 2048×1365 RGBA8888 PNG.
- 타이밍·충돌 프레임·앵커는 기존 전직별 계약을 유지한다.
