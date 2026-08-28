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

- 외부 녹음·샘플·음원 미사용
- `scripts/generate-v3-event-sfx-preview-v1.py`에서 NumPy 기반 오실레이터, 필터 노이즈, 금속 배음, 스테레오 패닝, 지연 탭을 오프라인 합성
- 런타임 합성 없음
- 48 kHz / 스테레오 / MP3 192 kbps
- FFmpeg `loudnorm` 목표: -16 LUFS, true peak ceiling -1.2 dBTP

## Scope

이 폴더 전체는 승인 전 독립 프리뷰 전용이며 현재 게임 런타임에는 연결되지 않습니다.
