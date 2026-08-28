# PROJECT V V3 Event FX + Combat SFX Preview V3

게임 런타임과 분리된 검토용 프리뷰입니다. `SkillEffectFX.js`, `BattleEngine.js`, 운영 FX/오디오 매니페스트에는 연결하지 않습니다.

## 구성

- 이벤트 6종: 치명타, 반격, 궁극기, 보스 궁극기, 회피, 불굴·부활
- 효과당 512×512 투명 PNG 12장
- 효과당 4×3 PNG 아틀라스 및 Pixi 호환 JSON
- 효과당 실제 녹음 소스를 레이어링한 48 kHz 스테레오 MP3 1개와 파형 SVG
- 프레임 스크럽, 무음 재생, 사운드 동기 재생, 6종 순차 재생
- 치명타는 1.35초 V3 전용 믹스이며, 검격 충돌 뒤 저역 잔향이 자연 감쇠하도록 다시 제작했습니다.
- 반격·궁극기·보스 궁극기·회피·부활은 승인된 V2 파일을 그대로 유지합니다.

## 오디오 원칙

- 오실레이터, 알림음, 절차적 합성음, 런타임 생성음을 사용하지 않습니다.
- 검격·금속 충돌·공기 파열·폭발·마법 원음을 역할별로 레이어링합니다.
- 각 원음의 실제 피크를 이펙트의 충돌 프레임에 맞춘 뒤 EQ·다이내믹·라우드니스 마스터링을 적용합니다.

## 재생성

```powershell
node scripts/generate-v3-event-fx-preview-v1.mjs
python scripts/generate-v3-event-sfx-preview-v2.py
python scripts/generate-v3-event-sfx-preview-v2.py --effect critical
```

로컬 정적 서버에서 `preview/project-v-v3-event-fx-v1/index.html`을 엽니다. `file://`에서는 브라우저의 `fetch()` 제한 때문에 매니페스트를 읽지 못할 수 있습니다.
