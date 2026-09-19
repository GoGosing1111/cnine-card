# 카르베인 · SSS 용병 원화 후보

## 최신 후보: 황금 기사 군주 V4 · 눈 발광 강화

- 사용자 교정: V2의 포즈·황금색은 승인. 용 갑주를 끝판왕 기사로 바꾸고, 얼굴을 마스크형 면갑으로 가린 뒤 근엄하고 강한 눈빛을 요청했다. 이어서 눈 발광을 더 강하게 요청했다.
- 상태: `SOURCE_ART_CONCEPT_USER_REVIEW_PENDING`
- 최신 원화: [assets/karvein-source-art-v4.png](assets/karvein-source-art-v4.png)
- 중간 원화: [assets/karvein-source-art-v3.png](assets/karvein-source-art-v3.png)
- V3: 황금 판금·왕실 망토·폐쇄 마스크형 투구로 재설계. [프롬프트](prompt-v3.txt)
- V4: 눈 안쪽의 백금빛 발광, 호박색 테두리와 면갑 근처의 광원을 강화하는 국소 편집. [프롬프트](prompt-v4.txt)
- 생성 방식: 내장 `image_gen.imagegen`. 두 원본 모두 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG로 무가공 복사했다.
- V3 SHA-256: `542FC220AE9EB5A27FF31E906902B22061BD3806B377E587B89A5924F9708107`
- V4 SHA-256: `0A80F69DAE2DDCED0D3898AA787FA207F89666DC35FAC433BA8FB8D6D0E80E45`
- 원본에서 두 눈의 발광, 마스크, 양쪽 발, 손과 검끝을 확인했다. 원화 시안이며 로스터·스킬·전투 SD와 라이브 등록은 별도다.

## V2 보존 기록: 포즈·황금색 승인, 갑주 수정 요청

- 사용자 교정: 오메가 참조의 화려한 황금색과 위압감을 맞추고 대검 구도를 다시 구성한다.
- 상태: `SOURCE_ART_CONCEPT_USER_REVIEW_PENDING`. V1은 사용자 반려본으로 보존한다.
- 원화: [assets/karvein-source-art-v2.png](assets/karvein-source-art-v2.png)
- 생성 방식: 내장 `image_gen.imagegen`, V1 및 사용자가 첨부한 오메가 이미지로 재구성. [프롬프트 전문](prompt-v2.txt)
- 규격: 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG. 원본 무가공 복사.
- SHA-256: `83183D29032803849E8D0704A0ABC8244E2E51A05C7CD38D54140BCDFCAAD413`
- 변화: 황금 갑주·적색 눈·황금 용익·광륜과 우주 배경. 길고 날씬한 전신 구도로 전환하고 검을 오른쪽 허리에서 왼쪽 아래로 길게 펼쳐 검끝까지 보이게 구성했다.
- 원본에서 양쪽 발, 투구, 검 손잡이와 검끝의 가시성을 확인했다. 이름은 가칭이며 원화 시안만 준비한 상태다.

## V1 보존 기록 · 사용자 반려

- 요청: 오메가와 동급인 SSS 용병 1종. 리니지M 할파스 변신 또는 MU 계열의 고급스럽고 강력한 갑주 분위기.
- 가칭: 흑룡황 카르베인 / Black Dragon Sovereign Karvein
- 상태: `USER_REJECTED_SOURCE_ART_CONCEPT`
- 생성 방식: 내장 `image_gen.imagegen`. 프롬프트 전문: [prompt-v1.txt](prompt-v1.txt)
- 원화: [assets/karvein-source-art-v1.png](assets/karvein-source-art-v1.png)
- 규격: 네이티브 1024×1536, 정확한 2:3, 24비트 RGB PNG. 생성 원본을 재가공하지 않고 복사했다.
- SHA-256: `9A46101818DD5E20831D9785AFC88EFAFA493A5FD0A5654B53F697CDB3A08D61`

## 디자인

흑요석·백금 판금과 청록빛 마력, 왕관형 폐쇄 투구, 용익, 대검으로 구성한 중갑 군주다. 오메가-X의 황금색 우주 콘셉트와 색·배경·날개 실루엣을 구분한다. 이번에는 카드 원화만 제작했다. 이름은 가칭이며 신규 로스터 코드, 스킬 배정, SD, 전투 수치와 라이브 등록은 포함하지 않는다.

원화 자체에는 카드 프레임·문자·로고를 합성하지 않았다. 원본에서 눈·손·검 손잡이의 연결과 대검의 형상을 확인했다. 사용자 시각 승인 및 실제 160px 프레임 적용 검수는 별도 진행한다.

## 참고와 작화 기준

- 프로젝트 기준: `docs/project-v-mercenary-card-art-standard.md`
- 최우선 채색·완성도 기준: 베스페라 V-004. 남성 중갑 보조 기준: 은빛 성기사.
- [NC 공식 할파스 설정](https://about.ncsoft.com/news/article/lm_story_251217): 암흑룡과 인간형 군주의 분위기 참고.
- [MU 공식 고급 갑주 자료](https://muonline.webzen.com/en/gameinfo/guide/detail/145): 상위 판타지 장비 계열 참고.
- 외부 게임 이미지 픽셀이나 로고는 원화에 합성하지 않았다.

프롬프트의 양손 파지 요청과 달리 생성본은 한 손으로 긴 손잡이를 잡고 반대 손을 내린 형태다. V1은 이 결과를 그대로 보존한 콘셉트 시안이다.
