# PROJECT V advancement SFX v1 provenance

These four files are new preview-only mixes. They follow the current live V3
recorded-source editorial method but do **not** reuse any final live role MP3.
No oscillator, synthesized tone, generated noise, or runtime synthesis is used.

## License

- Provider: Mixkit by Envato
- License: Mixkit Sound Effects Free License
- License URL: https://mixkit.co/license/#sfxFree
- Attribution: not required by the provider
- Scope: independent advancement-effect preview only; not connected to live runtime

## Verified recorded sources

| Mixkit ID | Title | SHA-256 | Direct asset URL |
| ---: | --- | --- | --- |
| 781 | Cinematic impact waves | `1dd7d383688ce07544322279ef43ccc0adec94ed65a51abb437863bcd67070cd` | https://assets.mixkit.co/active_storage/sfx/781/781.wav |
| 874 | Spell waves | `9f62b33ffe1690e266ec60416c702d3390f05361ab44b407609ef15354210479` | https://assets.mixkit.co/active_storage/sfx/874/874.wav |
| 877 | Healing water spell with deep hit | `ce0da16d048dad829c5ed19f9c710e8406b71b1b1675ab3c17bec0846b02e5f2` | https://assets.mixkit.co/active_storage/sfx/877/877.wav |
| 878 | Heal soft water spell | `27f574f4a35c633c3f26016b62e4cfe8d53b2523e47b9045b164e7dff946c032` | https://assets.mixkit.co/active_storage/sfx/878/878.wav |
| 1487 | Dagger woosh | `f8483970bec9e69ed7234545da9ee59a733c5310c8becbd3db8b6a63064c3049` | https://assets.mixkit.co/active_storage/sfx/1487/1487.wav |
| 1508 | Lightning whip | `6326cfd06e64e0b9b1a0da07327950c5a1325cf9e77bcca43b6b244528de3de2` | https://assets.mixkit.co/active_storage/sfx/1508/1508.wav |
| 2152 | Quick knife slice cutting | `a57a2611ad4484d1934d71b7a7a911cace8a0a91d1792f645f9d8199d65d507d` | https://assets.mixkit.co/active_storage/sfx/2152/2152.mp3 |
| 2160 | Metallic sword strike | `2717a659587f7962dbfdfc59b2716894620834b9d24836794560d86bf10b4c30` | https://assets.mixkit.co/active_storage/sfx/2160/2160.wav |
| 2655 | Fast impact blow | `1addc9a7e2d2e1780c2a48d78a79857e39d0287220c695104b1f2a6df7f57633` | https://assets.mixkit.co/active_storage/sfx/2655/2655.wav |
| 2792 | Fast sword whoosh | `e1de4e011ee6369aed772202a979590f03261e3607147bd2f04eda58ba5746eb` | https://assets.mixkit.co/active_storage/sfx/2792/2792.wav |
| 2793 | Quick magic sword slice | `785c10dd107c35db6dec78ccf123b7badb93215a8a243b05a73c3ae565d3b997` | https://assets.mixkit.co/active_storage/sfx/2793/2793.wav |

## Editorial design

- **SHATTER** — 검풍 예고, 칼날 물림, 250 ms 저역 파쇄 충돌, 억제된 압력파 잔향
- **RIPOSTE** — 넓은 방벽 압력, 마력 편향, 역방향 검풍, 300 ms 반격 충돌과 금속 물성
- **AFTERIMAGE** — 겹친 단검풍과 전기성 공기 절단, 178 ms 잔상 이탈 충돌, 짧은 저역 꼬리
- **IMMORTAL** — 수계 생명력 점화, 마력 전개, 333 ms 깊은 회복 블룸, 저역 중심 장잔향

All layers are decoded from the recorded sources, trimmed and aligned to the
specified impact point, filtered, mixed, compressed, limited, two-pass loudness
normalized, and encoded as stereo 48 kHz / 256 kbps MP3. The strongest intended
collision or bloom transient is aligned to the manifest `syncPointMs`.

## Final outputs

| Class | File | Duration | Sync | Target | SHA-256 |
| --- | --- | ---: | ---: | ---: | --- |
| SHATTER | `assets/audio/shatter-advancement-v1.mp3` | 1100 ms | 250 ms | -16.3 LUFS | `b4c498a8ae554411456f1c2b5a3883275b3d1e4b2fb974ab7df0b227c7b576c0` |
| RIPOSTE | `assets/audio/riposte-advancement-v1.mp3` | 1250 ms | 300 ms | -16.8 LUFS | `e649a410e874bdfef29f88981170a5faaa683b4e34550ae459148e538831078f` |
| AFTERIMAGE | `assets/audio/afterimage-advancement-v1.mp3` | 900 ms | 178 ms | -16.3 LUFS | `28b9a99971ad0564aa0da74fc8a9627cc2758ebd835db63da722e291f242aef6` |
| IMMORTAL | `assets/audio/immortal-advancement-v1.mp3` | 2200 ms | 333 ms | -19.5 LUFS | `d86b5f69e20c5d7f0527683d4f7c5980438c9dc912f75ebd006768f78b785691` |
