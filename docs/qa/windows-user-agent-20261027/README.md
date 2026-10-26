# Windows ASCII User-Agent — 2026-10-27 (KST)

DK's operator reported that the localized Electron product name reached User-Agent as non-ASCII characters and failed server header validation. The user requested a fix, then reported repeated native JavaScript error dialogs during this task's isolated verification.

## Changes

- Windows client 0.1.10 uses `Reversecall/0.1.10` in an ASCII-only browser User-Agent, with the actual Chromium/Electron versions and the existing Windows x64 platform identity.
- Set `app.userAgentFallback` before any window/session is created; explicitly apply it to the persistent game session. This covers the launcher, game, DK popups, subframes and requests forwarded by the HTTPS protocol handler.
- The visible name remains `리버스콜`. Application ID, NSIS GUID, existing `%APPDATA%/숲켓몬` profile, cookies, cache and update provider remain unchanged.
- Guard return-to-launcher against an already destroyed launcher. The native test's immediate exit exposed the old `launcher?.show()` call during game destruction; optional chaining did not protect against a destroyed Electron object. Normal close/reopen and launcher-first destruction are now verified.
- QA popups and launcher restoration stay hidden. The native fixture records uncaught exceptions as a failing result instead of opening Electron error dialogs on the user's desktop.

## Verification

- 32 related Node tests passed: ASCII headers/runtime-version validation, existing network Origin handling, resource store, updater and installer checks.
- `tests/windows-client-user-agent-20261027.native.mjs` runs the actual staged Electron entry point with the Korean productName, an isolated profile and local HTTP/TLS servers. Only the temporary certificate's SPKI is accepted; DK host resolution changes apply only to that test process. No production API writes or requests.
- The legacy localized UA produced HTTP 400 at the fixture's ASCII header boundary. The fixed UA produced successful requests for the game API, `www.playdk.kr` popup, cross-host redirect to `playdk.kr`, iframe, DK POST and a fresh Electron session. Request Authorization, body, Origin and cookies remained intact.
- Normal game close/reopen and destroying the launcher before the game complete without uncaught exceptions. All tested windows remain hidden. Final native evidence: `native-report.json`.
- Earlier harness attempts were not release passes: one used top-level await that blocked Electron readiness; another assumed Chromium would expose the final URL after a protocol handler followed a redirect. Both harness issues were corrected. The initial immediate-exit test exposed the shutdown error reported by the user; that application bug was then fixed and the final lifecycle checks passed.

## Build and release

Reuse source checkout `C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site` and the completed client-only build directory `C:/Users/User/.codex/tmp/reverse-call-windows-build-20261018`. No whole-project or dependency copy and no new worktree. Shared checkout changes from the separate account-level operation were preserved; only this task's files enter its commit.

Build with the existing `scripts/build-windows-client.mjs`, electron-builder and `scripts/build-windows-installer.mjs`; validate and publish through `scripts/publish-windows-client.mjs`. Source/app.asar equality, installer SHA-256, updater SHA-512 and GitHub asset digests are required. This is a Windows binary release; no Pages/Worker deployment or game-account changes are needed.

Published **0.1.10**, source **db8cdf488c9727106101ab593934650422bdb663**, to the existing public stable update feed. All five uploaded artifact digests matched. The real Electron GitHub updater subsequently read version 0.1.10, verified the public installer range download and matched its SHA-512/size to the built artifact. Evidence: `publish-receipt.json`, `installer-receipt.json`, `public-feed.json`.

Installer: https://github.com/GoGosing1111/cnine-card/releases/download/v0.1.10/ReverseCall-Setup-0.1.10-x64.exe. Setup SHA-256: `78c8b9b8e656fd3763b809850b53455a708e83a3b027b0a8f3322af8ea0d03c3`. Existing 0.1.5+ clients receive this through their normal update check and explicit restart button; this task did not terminate, replace or reinstall the user's running client.

Runtime QA working files are outside the repository at `C:/Users/User/Downloads/cnine-ops-records/windows-user-agent-20261027`. Preserve the final installer, source, test/report and release hashes. Remove only this task's disposable dependencies, unpacked build and isolated profiles after verification.

Cleanup outcome: the automatic approval review rejected the guarded PowerShell deletion command with `blocked by policy` before execution. No cleanup was performed or bypassed. The newly installed build `node_modules`, `release/win-unpacked` and this task's QA profiles remain. The pre-build storage audit measured `.codex` at 63.35 GiB; the final read-only audit measured 64.374 GiB with zero scan errors. Unrelated data and the running installed client were not modified.

Electron references: [global fallback user agent](https://www.electronjs.org/docs/latest/api/app#appuseragentfallback) and [session user agent](https://www.electronjs.org/docs/latest/api/session#sessetuseragentuseragent-acceptlanguages). These APIs are applied before webContents creation; session changes alone do not update existing webContents.
