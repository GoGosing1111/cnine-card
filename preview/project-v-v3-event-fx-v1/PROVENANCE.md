# Asset provenance

## Visual sources

- 생성 방식: OpenAI built-in `image_gen` tool
- 생성일: 2026-08-28
- 기준 이미지: 프로젝트 내부 `role-impact-v2`의 공격·방어·속도·회복 아틀라스
- 결과: 각 효과의 단일 피크 원화 6장
- 후처리: 순수 검정 배경을 알파로 변환하고, 예고·전개·충돌·파편 소멸의 12프레임을 오프라인 생성
- 원본 보존: `assets/source/*-source-v1.png`
- 금지 요소: 원형 문양, 마법진, 룬, 다이아, 별, 텍스트, UI

## Audio sources

- 이전 절차적 합성 SFX는 전부 폐기했습니다.
- 새 SFX는 Mixkit의 실제 녹음·제작 원음만 사용하며, [Mixkit Free License](https://mixkit.co/license/#sfxFree)를 따릅니다.
- 원음 목록과 SHA-256, 직접 자산 URL은 `assets/audio/manifest.json`에 기록합니다.
- 검격·금속 충돌: [Mixkit Sword SFX](https://mixkit.co/free-sound-effects/sword/)
- 폭발·중량 충격: [Mixkit Impact SFX](https://mixkit.co/free-sound-effects/impact/)
- 번개·공기 파열: [Mixkit Lightning SFX](https://mixkit.co/free-sound-effects/lightning/)
- 마법·회복: [Mixkit Spell SFX](https://mixkit.co/free-sound-effects/spell/)
- `scripts/generate-v3-event-sfx-preview-v2.py`에서 원음 트림, 피크 정렬, 레이어 믹스, EQ, 컴프레션, 리미팅, 2-pass 라우드니스 마스터링만 수행합니다.
- 오실레이터·합성 톤·생성 노이즈·런타임 합성은 사용하지 않습니다.
- 48 kHz / 스테레오 / MP3 256 kbps, 효과별 -12~-14 LUFS, true peak ceiling -1.0 dBTP
- 2026-08-28 검수에서 통과한 2~6번 SFX는 그대로 고정하고, 치명타만 검격·금속 이중 충돌·저역 잔향을 사용한 1.35초 V3로 재제작했습니다.
- 치명타 재생 도중 무음 자동 루프가 개입하지 못하도록 재생 경합도 차단했습니다.

## Scope

이 폴더 전체는 승인 전 독립 프리뷰 전용이며 현재 게임 런타임에는 연결되지 않습니다.
