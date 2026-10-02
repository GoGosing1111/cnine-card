# 구구가가 펫 일러스트 4종

최종 구성은 **펭귄 봉순·조은·디임 + 돼지 희야**다. 네 마리 모두 의상에 큰 한글 명찰을 달았다.

| 이름 | 파일 | 자세 |
| --- | --- | --- |
| 봉순 | `assets/pet-bongsoon-gugugaga-nametag-v2.png` | 펭귄 · 꽃을 들고 인사 |
| 조은 | `assets/pet-joeun-gugugaga-nametag-v2.png` | 펭귄 · 고개를 기울이고 볼 옆에 날개 |
| 희야 | `assets/pet-heeya-pig-nametag-v3.png` | 분홍 돼지 · 돼지 후드·귀·코·발굽·꼬리 |
| 디임 | `assets/pet-diim-gugugaga-nametag-v2.png` | 펭귄 · 옆으로 돌아 작은 인사 |

- 전부 1254×1254 sRGB RGBA PNG, 실제 투명 배경이다. 원본 생성 출력의 알파·픽셀을 그대로 보존했다.
- 각 이미지의 전체 캐릭터와 후드·날개·발의 잘림 여부를 육안 확인했고, 알파 채널·투명 픽셀·외곽 여백을 읽기 전용으로 검사했다.
- 내장 이미지 생성 도구 사용. 초기 프롬프트는 `prompts.md`, 최종 수정 프롬프트는 `revision-prompts.md`, 원본·참고 파일 경로와 해시는 `manifest.json`에 기록했다.
- 한글 명찰을 육안 확인했다. 무명찰 V1은 이전 시안이며, 실제 사용할 파일은 위 최종 파일 또는 `manifest.json`의 `assets` 목록이다.
- 최신 4종 ZIP: `../../output/pets-gugugaga-four-v1/gugugaga-pets-nametags-v3.zip`.
- 상태는 사용자 검수 대기다. 펫 이름·등급·능력치·획득·CMS·런타임 연결 및 운영 배포는 포함하지 않는다.
