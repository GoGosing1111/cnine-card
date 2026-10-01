# 나무늘봉순·조은 리미티드 용병 원화

[검수 프리뷰](index.html)는 승인된 프레임을 기본 적용한다. 원화·160px·프레임 단독·확대를 지원한다. **예상 SS이며 등급 확정·운영 등록은 별도다.**

- **나무늘봉순 승인:** [첨부 원본](assets/bongsoon-snow-source-art-approved-20261001.png)을 그대로 유지한다. [승인 기록](bongsoon-approval-20261001.json).
- **조은 사진 채택:** [사용자 재첨부 원본](assets/joeun-user-adopted-source-art-20261001.png)을 무가공 보존한다. [채택 범위·수정 제한](joeun-adoption-20261001.json). 얼굴·고개·시선·머릿결·의상·손·다리·포즈·배경은 고정하고 중화기 전방의 휨 보정만 요청됐다.
- **현재 조은 보정본:** [V11 전방 축·레일 정렬](assets/joeun-neon-source-art-v11-straightened-cannon.png). 채택본 1장만 입력한 국소 생성 편집 결과이며 사용자 검수 대기다.
- **프레임 V1 승인:** [투명 RGBA 원본](assets/mercenary-limited-frame-v1.png)과 [승인 기록](frame-approval-20261001.json)을 고정한다.

조은 V11은 **내장 image_gen**으로 제작했다. [실제 프롬프트·입력·출력 해시](prompt-joeun-v11.json)에 전방 무기만 수정하는 범위를 기록했다. 원본은 덮어쓰지 않았다. 생성 편집 결과는 비무기 영역도 픽셀 단위로 완전히 동일하지 않으므로 무손실 패치로 간주하지 않는다. [영역별 읽기 전용 비교](qa-joeun-v11-region-comparison.json)를 보존하며, 원본과 보정본의 얼굴·의상·포즈를 직접 비교했다.

이전 V10은 [경찰 조은](../../assets/ui/project-v/mercenaries/approved-20260907/mercenary-v042-police-joeun-source-art-v1.png)과 [롯데 조은 아바타](../avatar-lotte-joeun-bongsoon-v1/assets/avatar-lotte-joeun-lobby-source-art-v1.png) 얼굴을 확인하고 새 구도로 제작했다. [확장형 레이저포 참고](references/joeun-expanded-cannon-reference-v10.png)를 사용했으며 고개·시선과 다리 자세를 바꾸고 다리를 약 15% 더 가늘게 표현했다. [V10 생성 명세](prompt-joeun-v10.json)는 이력이다. 이후 사진 채택 지시가 전면 재제작 지시보다 우선한다.

프레임 밖까지 원화가 표시되던 문제는 배치만 수정했다. 가로·세로를 같은 **85.6%**로 맞추고 좌측 7.2%, 상단 5.6%에 두어 안쪽 테두리에 들어가도록 했다. 확대·160px에도 동일하게 적용하고 원화 보기에서는 전체 크기로 표시한다. 원화와 승인 프레임 PNG 자체는 잘라내거나 변형하지 않았다.

[매니페스트](manifest.json)는 현재 선택·채택 원본·생성 입력·과거 버전의 규격과 SHA-256을 기록한다.

| 고정·현재 파일 | SHA-256 |
|---|---|
| 봉순 승인 원본 | B15D0CCBB2429C539BC337198B1BABBD3D277E1FF84FC2DAD88B209431AC4FF3 |
| 프레임 V1 | A8931DBD4C8C069B2D38731F58AF708C373C8765412702ED040908FA750A506C |
| 조은 채택 재첨부 원본 | 65786A8DCB665A015AAA4BCC4DE8E9B91EA4F631FCE119D0C5903FFC86E1347D |
| 조은 V11 보정본 | 87E88A646E327FCBB6489B05D8C5287C5212B1D9105134ECE1C036D022C633DA |

[관련 프리뷰 검수](qa-preview-v11.json)는 PC·모바일의 프레임 안쪽 배치, 원본 로딩, 확대, 원화 보기, 160px와 가로 넘침에 한정한다. V1~V10 원화와 프롬프트는 이력으로 보존한다. 게임 실행 코드·운영 연결은 바꾸지 않았으며 전체 게임 검사나 운영 재배포는 하지 않는다. SD·스킬·전투 연결은 요청 범위가 아니다.
