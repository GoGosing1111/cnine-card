# Windows launcher and initial loading — 2026-10-24

User scope: Windows PC launcher plus the game's first loading screen. Android launcher is excluded. Follow-up corrections require dimensional image lettering for **REVERSE CALL**, preserving the existing R emblem, and replacing the mismatched navy launcher panels with dark purple.

## Result

- Shared amethyst cathedral gateway background, silver/amethyst dimensional English title with real alpha, lavender status/progress treatment.
- Existing codex metal panel and action frame adapted to purple through built-in ImageGen; original common navy/green assets remain intact. Launcher home, navigation selection, resource/help cards, disabled action and footer use the purple panel.
- Windows client version 0.1.9. Existing application ID, GUID, login profile, cache policy, download/repair, auto-update and actual progress remain unchanged.
- Boot uses the existing readiness signal and reduced-motion behavior. No artificial delay or fabricated percentage.

## Artwork and preservation

Source/derivative hashes and prompts: `assets/ui/loading/reverse-call-purple-20261024/manifest.json` and `prompts.json`; Windows references: `packaging/windows-client/art/manifest.json`.
Built-in `image_gen.imagegen` was used for the scene, button/panel recolors and title. Original PNGs are retained; WebPs use aspect-preserving encoding. The existing R emblem bytes are unchanged. Technical checks are not recorded as user visual approval.

## Validation

- Actual Electron renderer at 1120×760 and minimum 950×680: home, resources, help, readable title, contained content and usable buttons. Native screenshots respect Windows display scaling.
- Native local fixture: download → start → close → repair → repeat start; cached resources do not redownload; session/API transport preserved; remote Node/launcher bridge disabled. `native-functions.json`.
- Final purple panel visual pass: `native-visual.json`, `native-screens.json` and screenshots. Initial hidden-window CDP screenshot timed out; Electron's native `capturePage` with `stayHidden` produced the verified captures without displaying a test window.
- Actual first-loading renderer: 1440×900, 963×588, 390×844, 320×568, 844×390, and 320px with fallback fonts; no clipping/errors, real login transition and reduced-motion verified. `loading-browser.json`.
- Scoped release checks: existing Windows client, updater and installer unit checks plus the existing boot-readiness regression. UI/art-only change; no economy, combat or permissions changes.

## Release scope

Production base verified through Cloudflare: `9f4aecd09cb6590af7f6bedc0e7454ae9e8e435b` / Pages `a36716fa-bb99-4c0b-8584-230d968643af`. This release starts from the latest main and preserves the concurrent Razak release.

The original shared source checkout had unrelated active changes. A managed sparse worktree isolates this release; existing build dependencies and the previous client-only build directory were reused. No project/node_modules copy was made. New disposable dependencies are removed after verification; artwork/prompts and latest installer are retained.

Final web source **a4631dec2d3d6c642ca110658e1a2b15dd0cffbd**, Pages **4020965f** (Windows source remains **c3d4a2f92c469baf02c822e67782ad05e63aa2db**), Windows **0.1.9** published at https://github.com/GoGosing1111/cnine-card/releases/tag/v0.1.9.

All 40 scoped checks passed. The initial sparse checkout omitted three unrelated prison fixture PNGs used by the existing boot-regression file; materializing those tracked fixtures resolved preflight without changing tests or game logic. Pages publishes 19,999 files (14 uploaded, 19,985 reused). The three loading runtime WebPs match public SHA-256, and the real public first-loading screen loads the dimensional title then releases to the visible app without errors.

Final installation download: https://github.com/GoGosing1111/cnine-card/releases/download/v0.1.9/ReverseCall-Setup-0.1.9-x64.exe. Installer/package/source verification and all five uploaded artifact digests passed. The existing R logo files remain unchanged.

The temporary client dependencies and unpacked build were reclaimed (861,063,166 bytes); published installers, hashes, receipts, source and unique artwork are preserved.

The final web-only correction places the image-title layout rules after the boot defaults, matching the six locally verified sizes; the existing boot suite passed 12/12 again. Public capture waits for stylesheets, fonts and two animation frames after decoding so it records painted images rather than the pre-paint compositor state. No runtime delay was introduced. Final public title is 620×248 at 1440×900, with the original R emblem, and the boot releases normally.
