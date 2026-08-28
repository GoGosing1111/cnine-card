# PROJECT V V3 Event FX Preview V1

게임 런타임과 분리된 검토용 프리뷰입니다. `SkillEffectFX.js`, `BattleEngine.js`, 운영 FX/오디오 매니페스트에는 연결하지 않습니다.

## 구성

- 이벤트 6종: 치명타, 반격, 궁극기, 보스 궁극기, 회피, 불굴·부활
- 효과당 512×512 투명 PNG 12장
- 효과당 4×3 PNG 아틀라스 및 Pixi 호환 JSON
- 효과당 48 kHz 스테레오 MP3 1개와 파형 SVG
- 프레임 스크럽, 무음 재생, 사운드 동기 재생, 6종 순차 재생

## 재생성

```powershell
node scripts/generate-v3-event-fx-preview-v1.mjs
python scripts/generate-v3-event-sfx-preview-v1.py
```

로컬 정적 서버에서 `preview/project-v-v3-event-fx-v1/index.html`을 엽니다. `file://`에서는 브라우저의 `fetch()` 제한 때문에 매니페스트를 읽지 못할 수 있습니다.
