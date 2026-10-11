# 흑금 메카 궁수 · V3 전신 대기 자세 V2

사용자 첨부의 디자인을 참고해 활을 든 전신 리소스 1장을 제작했다. 현재 결과는 [투명 PNG](assets/obsidian-archer-standing-v2.png), 1282×1562 RGBA다.

사용자는 최초 V1의 얼굴과 몸통이 가로로 압축된 듯 좁으며 원본 얼굴·상체 반영이 부족하다고 지적했다. 이어 **참고 사진 자체가 메카 디자인**이라는 뜻이라고 정정했다. 메카성을 제거하는 방향은 잘못된 해석이며 적용하지 않았다. V2는 투구·가슴·어깨 폭과 원본의 층진 흑금 기계 장갑을 강화한 재작화다.

- **built-in image_gen** 사용. [V1 프롬프트](prompts/standing-v1.txt), [실제 V2 수정 프롬프트](prompts/standing-v2-reference-correction.txt).
- V2 입력은 [사용자 원본](assets/source/user-reference.png)이 디자인 기준, [반려 V1](assets/source/archer-v1-rejected-narrow.png)은 활을 든 구도만 참고한 보조 입력이다.
- [V2 생성 원본](assets/source/archer-v2-generated.png)은 무가공 보존했다. [pack-resource.mjs](pack-resource.mjs)는 사방 80px 투명 여백만 더한다. 크기 조절·가로 늘리기·도색·알파 삭제를 하지 않으며 내부 전체 RGBA 픽셀 일치를 검증한다.
- [packing-report.json](packing-report.json)에 원본/출력 해시와 픽셀 일치 결과, [manifest.json](manifest.json)에 원본·프롬프트·사용자 정정·선택/반려 상태를 기록했다.
- 투구·흉갑 반영, 얼굴/몸통 폭, 기계식 어깨·팔 연결, 긴 다리와 발 연결, 활·화살·파지·시위 및 전신 잘림을 직접 확인했다.
- V2 사용자 시각 승인은 아직 받지 않았다. 이 결과는 **서 있는 기본 자세 PNG 1장**이며 연속 모션 재생 완료로 기록하지 않는다. 이후 실제 모션 제작은 [공통 공정](../../docs/project-v-motion-effects-production-standard-20260927.md)을 따른다.

검증은 원본 해시·PNG 알파·패킹 픽셀 일치·JSON 경로와 diff에 한정한다. 이름·등급·능력치·CMS·지급·운영 전투 연결은 변경하지 않는다.

