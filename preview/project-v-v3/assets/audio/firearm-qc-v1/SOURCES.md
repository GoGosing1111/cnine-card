# PROJECT V V3 firearm QC audio sources

These three assets are used only by the independent PROJECT V V3 Battle Suit QC preview. They are not wired to live automatic combat.

| Preview weapon | Real recording | Author | Freesound ID | License | SHA-256 |
| --- | --- | --- | ---: | --- | --- |
| Avalon M4A1 | Colt M4A1 SOCOM, exterior close | areniporgen | [737569](https://freesound.org/people/areniporgen/sounds/737569/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `1735B196B5DB6369D734EE5731834E35C9AD17A2A32353E9D809B6C6C2ECB6F2` |
| Infinity AK | Recorded AK-47 single shot | LeMudCrab | [163457](https://freesound.org/people/LeMudCrab/sounds/163457/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `26BBB8986AEA9958B1C5DA48C8EEC1B205AA153680EF74DCD2B344C5863E5B73` |
| Infinity M200 visual | MacMillan Tac-50A1-R2 suppressed .50 BMG acoustic proxy | areniporgen | [737570](https://freesound.org/people/areniporgen/sounds/737570/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `F4E5F79C3D4BB47C9A8D396564CD02FDD099C26E9FDD37BB75DB563B9A2C4C8B` |

Retrieved on 2026-09-01. The downloaded HQ-preview bytes are preserved without baked processing. At runtime each recording is split non-destructively into action/notice, ballistic impact, and acoustic-tail buffer-source layers. The strongest recorded impact is scheduled to the authored `fire` frame and QC passes only when the measured callback delta is within ±20 ms.

The M200 sprite remains the exact database weapon asset. Its audio is explicitly labeled as a real high-caliber Tac-50 proxy because no compliant M200 recording exists in the repository.
