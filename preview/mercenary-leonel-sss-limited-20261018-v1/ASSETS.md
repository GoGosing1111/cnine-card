# 레오넬 전투 자산 제작 기록

상태: SSS 리미티드 사용자 지정 / 신규 원화·전투 리소스 시각 검수 후보 / 운영 등록 OFF.

## 원본과 무기

최종 원화 후보는 `assets/sources/leonel-final-art-v1.png`다. SHA-256은 `43d4c211ff58bff672e8614aa50fcd8f6c5099c667dd2f4c42c44bde75ab2e00`이며, 원화의 검날과 가드에서 보이는 39,256개 RGBA 픽셀을 선택했다. 선택 영역·원본 오프셋·손 파지점·검날 시작·검끝은 `asset-registration.json`에 있다.

고정 검은 `assets/locked/leonel-sword.png` 한 장이다. SHA-256은 `c932515485dadcd0a0d3826f37f42f5b29a43311ab0104f390c5347e3ffe2894`다. `assets/locked/weapon-provenance.json`에 출처를 보존한다. 모든 동작에서 동일한 래스터에 균일 배율·회전·이동만 적용하며, 새로 그린 검 픽셀은 0이다. 손과 짧은 손잡이는 몸 시트에 속한다. 망토가 검을 가리지 않도록 검날·가드를 몸 앞에 합성하고, 원본 검 선택 영역에는 손을 포함하지 않았다.

## 사용자 크기 유지 지시

사용자 후속 지시인 ‘크기줄어들게하지마라 이대로 유지해서 만들어’를 적용했다. 첨부된 idle 원본의 정수리~발 기준 **610px**를 모든 동작의 신체 기준으로 고정했다. 웅크리거나 몸을 기울인 자세의 보이는 높이를 610px로 늘리지 않는다. 각 소스 시트의 정상 신체 기준 높이를 등록하고 한 시트 전체에 같은 균일 배율을 적용한다. 몸 대비 검 길이도 원본의 1120px 신체/약651px 검 길이 비율을 유지한다.

610px 몸과 원본 비율의 검을 모두 담기 위해 셀을 **1280×1280**으로 넓혔다. 8프레임 아틀라스는 **3열×3행, 3840×3840**으로 패킹해 4096px 텍스처 한도 안에 둔다. 캐릭터를 시트에 맞춰 줄이지 않는다. idle은 4프레임, dash/attack/skill/ultimate은 각각 8프레임으로 총 36프레임이다.

`qa/*-native-size.png`는 개별 프레임의 바깥 투명 여백만 잘라 검수 배경에 합성한 이미지다. 리사이즈하지 않았다. `qa/native-size-proof.json`에 잘라낸 사각형과 610px 기준을 기록한다. 작은 `contact-*.png`는 전체 흐름 확인용 축소 썸네일이며 실제 게임 자산이 아니다. 고해상도 접촉 시트는 `qa/contact-*-native.png`, 피벗·검날 축 오버레이는 `qa/registration-*-native.png`다.

## 효과와 멘트 프레임

아우라, 대시, 횡베기, 교차베기, 광역 절단, 지면 파열, 배경 검압은 각각 4열×3행의 실제 12단계 원화다. 총 84프레임이며 동일 정지 그림의 색상 변경이나 확대 반복으로 대체하지 않았다. 선택 소스는 aura V2, dash V2, crosscut V2, ultimate V2, slash V1, fracture V1, pressure V1이다. `sources-fx-generation.json`에 실제 프롬프트, 원본, 해시와 선택·반려 기록을 보존한다.

효과의 `contentBounds`는 모든 12프레임에서 alpha>16인 영역을 합친 **효과별 고정 경계**다. 런타임은 이 값으로 투명 여백 증가에 따른 효과 축소를 방지한다. 프레임마다 크기를 정규화하지 않으므로 발동→확장→잔향의 실제 크기 변화가 유지된다. 낮은 알파의 고립된 잔향은 어두운 배경에 합성해 눈에 보이는 잘림·다른 프레임의 주 형태 오염이 없는지 별도로 판정했다. 해당 기록은 FX 생성 기록과 `qa/fx-*-stages3-8.png`에 있다.

`assets/ui/dialogue-frame.png`는 이번 검사의 백은·금장·흑철 재질로 생성한 전용 멘트 프레임이다. 원본의 투명 바깥 여백만 사각형으로 잘랐으며 재색칠·알파 변경이 없다. 문구는 이미지에 굽지 않고 DOM으로 표시한다.

## 재현

```powershell
node preview/mercenary-leonel-sss-limited-20261018-v1/build-assets.mjs --weapon-only
node preview/mercenary-leonel-sss-limited-20261018-v1/build-assets.mjs
node preview/mercenary-leonel-sss-limited-20261018-v1/qa-assets.mjs
node preview/mercenary-leonel-sss-limited-20261018-v1/build-qa-previews.mjs
```

빌더는 몸·검 합성, 투명 여백, 발바닥 피벗·파지점·검끝, 출처 해시, 개별 프레임·아틀라스·썸네일과 매니페스트를 재현한다. 기술 검사는 선택된 무기 픽셀의 원본 동일성, 36개 동작의 동일 무기 출처·균일 배율·알파 경계·등록점, 84개 효과의 실제 서로 다른 RGBA 셀과 알파, 운영 등록 OFF를 검사한다. 기술 검사 통과는 사용자의 시각 승인을 의미하지 않는다.

이 자산은 기존 V3 BattleEngine/PixiJS/GSAP 프리뷰 전용이다. 계정 지급·획득 확률·전투 수치·운영 캐릭터 코드·CMS·출시 플래그는 추가하지 않았다. 실제 PC/모바일 재생 및 접촉·제어 검수 결과는 메인 README와 런타임 QA 기록을 따른다.
