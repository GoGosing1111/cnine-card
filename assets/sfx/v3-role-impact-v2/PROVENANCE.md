# V3 role impact SFX provenance

이 폴더의 최종 파일 4개는 기존 V3 합성음이나 브라우저 오실레이터를 재사용하지 않았다. Mixkit의 개별 원본 SFX를 내려받아 역할별로 편집·레이어링·필터링·마스터링했다.

## License

- Provider / rights administrator: **Mixkit by Envato** (개별 제작자 이름은 해당 SFX 페이지와 다운로드 응답에 공개되어 있지 않음)
- License: **Mixkit Sound Effects Free License**
- License page: https://mixkit.co/license/
- Sound-effects library and commercial-use statement: https://mixkit.co/free-sound-effects/
- Terms: https://mixkit.co/terms/
- Permitted use stated by Mixkit: personal and commercial projects; attribution is not required.
- Retrieved: 2026-08-27 (Asia/Seoul)

The original files are retained in `_source/`. The final MP3 files are transformed, mixed game-ready derivatives and are not a stock-library redistribution bundle.

## Source files

| Local source | Mixkit title | Original item/download URL |
| --- | --- | --- |
| `_source/mixkit_1508_lightning-whip.wav` | Lightning whip | https://mixkit.co/free-sound-effects/download/1508/ |
| `_source/mixkit_2601_electricity-lightning-blast.wav` | Electricity lightning blast | https://mixkit.co/free-sound-effects/download/2601/ |
| `_source/mixkit_781_cinematic-impact-waves.wav` | Cinematic impact waves | https://mixkit.co/free-sound-effects/download/781/ |
| `_source/mixkit_874_spell-waves.wav` | Spell waves | https://mixkit.co/free-sound-effects/download/874/ |
| `_source/mixkit_2793_quick-magic-sword-slice.wav` | Quick magic sword slice | https://mixkit.co/free-sound-effects/download/2793/ |
| `_source/mixkit_2152_quick-knife-slice-cutting.mp3` | Quick knife slice cutting | https://mixkit.co/free-sound-effects/download/2152/ |
| `_source/mixkit_2655_fast-impact-blow.wav` | Fast impact blow | https://mixkit.co/free-sound-effects/download/2655/ |
| `_source/mixkit_878_heal-soft-water-spell.wav` | Heal soft water spell | https://mixkit.co/free-sound-effects/download/878/ |
| `_source/mixkit_877_healing-water-spell-deep-hit.wav` | Healing water spell with deep hit | https://mixkit.co/free-sound-effects/download/877/ |

## Final assets and processing

All outputs are stereo MP3, 44.1 kHz, 192 kbps. FFmpeg 7.1 was used for non-destructive editorial processing.

### `speed.mp3` — 1.23 s

- Lightning whip supplies the immediate electrical snap.
- The impact section of Electricity lightning blast is trimmed and delayed 26 ms for body.
- Fast impact blow is delayed 72 ms and low-passed for a grounded transient.
- High-pass/low-pass filtering, bus compression, loudness normalization, and a short tail fade were applied.
- No metallic/bell source and no generated oscillator are present.

### `defense.mp3` — 1.33 s

- Cinematic impact waves supplies the broad shield lock and low-frequency weight.
- A duplicate low-passed band reinforces the shield body without a metal clang.
- Spell waves is delayed 48 ms to make the water barrier spread after the guard catches.
- Bus compression, loudness normalization, and a short tail fade were applied.

### `attack.mp3` — 0.97 s

- Quick magic sword slice supplies the red blade-aura whoosh.
- Quick knife slice cutting is delayed 58 ms for the spear-like bite.
- Fast impact blow is delayed 105 ms and low-passed for the hit body.
- No sword-clang, bell, gong, or other ringing metal source is used.

### `heal.mp3` — 1.72 s

- Heal soft water spell supplies the soft green restorative rise.
- Healing water spell with deep hit is delayed 110 ms for the recovery bloom.
- Upper frequencies are capped, then a restrained short echo, compression, normalization, and tail fade are applied.
- No bell, chime, gong, or browser oscillator is used.

## Integration contract

Load `manifest.json` and use `roles[role].src`. The `syncPointMs` value is the intended visual collision/bloom cue for each effect.
