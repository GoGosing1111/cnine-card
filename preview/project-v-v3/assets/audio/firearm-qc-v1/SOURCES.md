# PROJECT V V3 firearm QC audio sources

These three immutable CC0 assets serve four weapon profiles used by the independent PROJECT V V3 Battle Suit in live PVE and its matching QC preview. Competitive modes remain disconnected.

| Battle Suit weapon | Real recording | Author | Freesound ID | License | SHA-256 |
| --- | --- | --- | ---: | --- | --- |
| Avalon M4A1 | Colt M4A1 SOCOM, exterior close | areniporgen | [737569](https://freesound.org/people/areniporgen/sounds/737569/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `1735B196B5DB6369D734EE5731834E35C9AD17A2A32353E9D809B6C6C2ECB6F2` |
| Infinity AK | Recorded AK-47 single shot | LeMudCrab | [163457](https://freesound.org/people/LeMudCrab/sounds/163457/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73` |
| Infinity M200 visual | MacMillan Tac-50A1-R2 suppressed .50 BMG acoustic proxy | areniporgen | [737570](https://freesound.org/people/areniporgen/sounds/737570/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `F4E5F79C3D4BB47C9A8D396564CD02FDD099C26E9FDD37BB75DB563B9A2C4C8B` |
| Sovereign SKS visual | Recorded AK-47 single shot, 7.62×39mm acoustic proxy | LeMudCrab | [163457](https://freesound.org/people/LeMudCrab/sounds/163457/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73` |

Retrieved on 2026-09-01. The downloaded HQ-preview bytes are preserved without baked processing. At runtime each recording is split non-destructively into action/notice, ballistic impact, and acoustic-tail buffer-source layers. The strongest recorded impact is scheduled to the authored `fire` frame and QC passes only when the measured callback delta is within ±20 ms.

Live PVE and the QC preview apply one common output gain of `0.25` (approximately `-12.04 dB`) after each weapon profile's documented master gain. This is half of the preceding `0.50` preview output and changes playback amplitude only; it does not modify the source files, per-weapon balance, three-layer timing, or visual synchronization.

During automatic Battle Suit fire, each shot receives an additional `0.55` gain and at most two three-layer shot groups may overlap. Before a third shot is scheduled, the oldest group is stopped. This prevents automatic AR bursts from stacking long recording tails into an excessive output level while preserving the real recordings and the weapon-relative mix.

The M200 sprite remains the exact database weapon asset. Its audio is explicitly labeled as a real high-caliber Tac-50 proxy because no compliant M200 recording exists in the repository.

The SKS sprite remains the exact database weapon asset. Its audio explicitly reuses the existing real AK-47 single-shot recording as a 7.62×39mm proxy because no compliant SKS recording exists in the repository. It is not represented as an exact SKS receiver recording. The SKS profile uses a lower `0.46` master gain and reduced impact/tail gains so the shared recording remains a conservative DMR mix; the source bytes are not copied, regenerated, or altered.
