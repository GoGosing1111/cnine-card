# 레오넬 V2 자산 색인

현재 사용 자산의 단일 기준은 [manifest.json](manifest.json)이다. 이 폴더의 파일명에 포함된 v1/v2만으로 선택 여부를 판단하지 않는다. 이전 제작 원본과 반려 후보도 보존돼 있다.

- 몸 40프레임: 대기 4, 대시 8, 공격 8, 일반 스킬 8, 광역기 12.
- FX 84프레임: 7종 × 12.
- 각성 상반신 연속 작화 4프레임.
- 동일 원본 검 1장, 대사 전용 이미지 프레임 1장.
- 신체 기준 610px, 개별 셀 1280×1280. 궁극기 아틀라스는 2페이지로 분할하며 몸을 축소하지 않는다.
- [생성/선택/반려 기록](source-generation.json), [효과 생성 기록](sources-fx-generation.json), [실제 호출 프롬프트](prompts/).
- [원본 픽셀 패킹](pack-v2-effects.mjs), [등록 좌표](asset-registration.json), [빌더](build-assets.mjs).
- 공격 동작 2× / 효과 1×: [motion.mjs](motion.mjs), [실제 비교 검사](qa/motion-rates.json).
- [검수용 성능 프로필](combat-profile.mjs): 기본 전투력 1,940,890. 운영 등록/지급/출시는 미실행.

상세 제작 공정, 시연 영상과 검수 결과는 [README.md](README.md)에 있다.
