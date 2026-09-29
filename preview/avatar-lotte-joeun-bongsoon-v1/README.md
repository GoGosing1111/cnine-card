# 롯데 조은 · 롯데 나무늘봉순

2026-09-30 사용자 요청에 따른 롯데 클랜 제복 아바타 원화 2종이다. 크림색 상의, 버건디 칼라·소매·견장, 짧고 타이트한 펜슬 미니스커트, 금색 단추·파이핑과 롯데 갈매기 문장을 공통 디자인으로 사용한다.

| 시안 | 얼굴 참고 | 결과 |
|---|---|---|
| 롯데 조은 | 승인 조은 간호사 원화 | `assets/avatar-lotte-joeun-lobby-source-art-v1.png` |
| 롯데 나무늘봉순 | 승인 봉순 간호사·나무늘봉순 아바타·망이사 원화 | `assets/avatar-lotte-bongsoon-lobby-source-art-v2.png` |

망이사는 기존 제작 기록에서 나무늘봉순 얼굴로 만든 승인 용병임을 확인했다. 이번 작업에서는 봉순 얼굴 참고로만 사용했다. 조은의 옆머리·낮게 묶은 머리와 봉순의 앞머리·긴 머리·금색 머리핀을 각각 유지했다. 롯데 아윤은 제복의 색과 재질 참고이며 얼굴 참고로 사용하지 않았다.

내장 `image_gen`으로 각각 생성한 1024×1536 RGB PNG 원본을 무가공 보존한다. 두 원본 모두 얼굴, 손, 의복, 전신과 신발 잘림을 시각 확인했으며 파일 규격·SHA-256을 `manifest.json`에 기록했다. 참조 원본은 변경하지 않았다.

사용자 후속 “봉순 포즈좀 바꿔봐”에 따라 봉순 V2는 몸을 살짝 틀고 양손을 등 뒤로 모으며 다리를 교차하지 않는 자세로 수정했다. 얼굴·머리·제복·배경을 유지했고 최초 V1도 보존했다. 조은은 V1을 그대로 유지한다.

생성 프롬프트: [조은](prompt-joeun-v1.md), [나무늘봉순 최초](prompt-bongsoon-v1.md), [나무늘봉순 자세 수정](prompt-bongsoon-v2.md).

## 승인·장비창·등록

후속 “ㅇㅇ 장비창 ui 만들고 등록해”로 조은 V1과 봉순 V2를 승인했다. 이어 “옵션은 한복디임2 기준으로 다 맞추고 롯데 클랜 전체 클랜 시즌 종료까지 지급해”로 운영 등록과 지급을 확정했다.

- A-27 `LOTTE_JOEUN` / 롯데 조은
- A-28 `LOTTE_NAMU_BONGSOON` / 롯데 나무늘봉순
- 장비창 전신: `assets/avatar-lotte-joeun-equipment-source-art-v1.png`, `assets/avatar-lotte-bongsoon-equipment-source-art-v1.png`.
- 내장 image_gen 원본 1024×1536 RGBA, 원래 생성 알파 보존. [조은 프롬프트](prompt-equipment-joeun-v1.md)·[봉순 프롬프트](prompt-equipment-bongsoon-v1.md).
- `node preview/avatar-lotte-joeun-bongsoon-v1/build-assets.mjs`로 원본 해시·알파를 확인하고 기존 계약의 로비 1024/640 WebP, 장비창 640×1664 WebP를 만든다. 투명 여백 정리·균일 배율·패딩·압축만 적용한다.
- `index.html`은 기존 공용 장비창을 재사용한다. PC·모바일 두 아바타의 로비/장비창 전환, 전신·알파·이미지 로딩·가로 넘침을 확인했다. 검수 소리는 OFF다.
- 한복 디임2 운영 옵션: 드랍률 +30%, 코인 획득량 +100%, 레이드 입장 +10회, 전투력 +3%. 현 롯데 18명에게 각 2종, 현 시즌 종료인 2026-10-11 22:00 KST까지 지급한다.

카탈로그는 `catalogs.json`, 파생 자산 기록은 `runtime-manifest.json`, 운영 결과와 최소 검사 범위는 [등록·시즌 지급 기록](../../docs/lotte-uniform-avatars-release-20260930.md)에 보존한다.
