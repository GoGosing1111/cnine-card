# 나무늘봉순 · 화이트 골드 AK 용병 원화 후보

## 최신 후보 V3 · 레드 치파오와 야간 궁전

- 사용자 요청: 옷을 레드로 바꾸고 배경 변경.
- 최신 원화: [assets/namu-bongsoon-ak-source-art-v3.png](assets/namu-bongsoon-ak-source-art-v3.png)
- 상태: `SOURCE_ART_OUTFIT_REVISION_USER_REVIEW_PENDING`
- 디자인: 루비 레드 새틴 치파오와 금색 자수. 배경은 붉은 등롱, 목조 회랑, 연못과 누각이 보이는 야간 동양식 궁전으로 변경했다.
- 얼굴·체형·헤어·의상 재단·포즈 및 승인 AK의 형태와 파지 구도를 유지하도록 편집했으며, 원본에서 주요 요소의 시각적 일관성을 확인했다.
- 생성: 내장 `image_gen.imagegen`. [편집 프롬프트](prompt-v3.txt)
- 규격: 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG, 생성 원본 무가공 복사.
- SHA-256: `5D30FF060D8754A010A8F038ADB21D6A5E0BE87191F0B6D1C4329868C48DBB28`

## V2 보존 기록 · 비취색 치파오

- 사용자 승인 범위: V1 무기 디자인 승인. 얼굴·체형은 유지하고 옷 콘셉트와 헤어를 수정하도록 요청했다.
- 수정 요청: 짧고 타이트한 치파오, 상의 여밈을 조금 푼 형태, 몸매와 다리가 드러나는 구성, 소폭 헤어 변경.
- 최신 원화: [assets/namu-bongsoon-ak-source-art-v2.png](assets/namu-bongsoon-ak-source-art-v2.png)
- 상태: `SOURCE_ART_OUTFIT_REVISION_USER_REVIEW_PENDING`
- 디자인: 짙은 비취색 새틴과 금색 자수·테두리, 열린 깃과 상의 여밈, 짧은 옆트임 치마, 긴 검은 반묶음 머리와 금색 핀. V1의 승인 AK 디자인과 파지 구도를 유지하도록 편집했다.
- 생성: 내장 `image_gen.imagegen`. [편집 프롬프트](prompt-v2.txt)
- 규격: 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG, 생성 원본 무가공 복사.
- SHA-256: `1479DA5BA6BE5FBAF9D1424A4C43DB66D9D2BC6EEC2C673F9065434A69157C12`
- 원본에서 얼굴·체형, 치파오 여밈·치마 밑단, 무기의 주요 부품과 두 손 파지의 시각적 일관성을 확인했다. 무기 승인은 의상 최종 승인·등급·스킬 배정·라이브 등록 승인과 구분한다.

## V1 보존 기록 · 무기 승인

- 사용자 요청: 나무늘봉순 아바타를 바탕으로 체형을 유지하고 짧고 타이트한 치마와 첨부한 스킨을 참고한 AK를 갖춘 용병 제작.
- 상태: `SOURCE_ART_CONCEPT_USER_REVIEW_PENDING`
- 원화: [assets/namu-bongsoon-ak-source-art-v1.png](assets/namu-bongsoon-ak-source-art-v1.png)
- 규격: 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG. 생성 원본을 무가공 복사했다.
- SHA-256: `C2B52E0110C54E188C0E1EA3CC55AEB376804506A63F6A5A7E8AD07CA5C4927C`
- 생성: 내장 `image_gen.imagegen`. [프롬프트 전문](prompt-v1.txt)

## 참조

1. 승인 아바타 `NAMU_BONGSOON` / A-23의 원화. 얼굴과 체형을 명시적으로 참조하라는 사용자 요청에 따른다. 기존 멤버 카드 사진을 작화 표본으로 사용하지 않았다.
   - 원본: `C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/preview/avatar-namu-bongsoon-v1/assets/avatar-namu-bongsoon-lobby-source-art-v1.png`
   - 승인 원본 SHA-256: `c05f7e73ed588dd38b7ac7cc3cf311c5b139e52817073583822526a20d9e6728`
2. 사용자 제공 무기 스킨: [references/user-ak-skin.png](references/user-ak-skin.png). 흰색·금색 외장, 검은 내부, 각진 탄창과 개머리판의 시각 요소를 AK 계열 총기에 재해석했다.
3. 용병 작화 기준: `docs/project-v-mercenary-card-art-standard.md`.

## 제작 범위와 검수

둥근 볼선·긴 검은 머리·기존 체형·몸에 붙는 화이트 미니 원피스를 기준으로 제작했다. 얼굴, 치마 밑단, AK의 총구부터 개머리판까지, 양손의 무기 접점을 원본에서 확인했다. 생성본 총구는 화면 오른쪽 아래를 향하며 프롬프트의 방향 요청과는 반대지만 사용자 요구인 총기 전체 형태와 얼굴·치마 가독성을 유지한다.

이번 산출물은 용병 카드 원화 후보다. 새 코드·등급·스킬·획득 정책과 운영 등록은 지정하지 않았으며, 이전 SSS 기사 후보의 등급을 이 캐릭터에 승계하지 않는다. 기존 아바타와 카드 원본은 수정하지 않았다. 사용자 시각 승인과 실제 프레임·160px 적용 검수는 별도다.
