# ONE store APK — 2026-10-30

This is a separate permanent distribution of 리버스콜. It is not a review-only mode.
All accounts use the same restrictions before and after store review.

- Package: `kr.yakcode.reversecall.onestore`
- Version: 1.0.2 / versionCode 3
- Android: minSdk 24, targetSdk / compileSdk 36
- Signature: existing YAKCODE key; APK Signature Scheme v2
- APK SHA-256: `d4ab7f15a90307f6fbf723b71d811d7dc49f2990b2ae58ff6b928d22bf909bae`
- APK size: 4,306,383 bytes
- Delivery: `C:/Users/User/Downloads/ReverseCall-ONEstore-1.0.2-review-20261030/ReverseCall-ONEstore-1.0.2.apk`
- Build source: `174d728bac8a50cc131d6bacb661c1c7cf6cfe6d`; server release `2573ff34a` / Pages `af3011cb`.

At the user's request, the shared server no longer limits registration to one
account per network. Nickname uniqueness, personal keys, sessions and starting
currency are retained. The historical IP ledger is preserved and no longer used
by registration. This applies equally to all clients and does not require an APK
reinstall. Version 1.0.2 is the requested new store submission binary.

The 1.0.1 APK and its QA remain in their original delivery directory. All seven web
files and native/web source hashes are identical, so their 31 native and 33 browser
checks are reused explicitly. This APK's release build/lint, metadata, signature,
zip alignment and embedded hashes were checked again. The server's registration,
nickname and session behavior has nine additional PostgreSQL-backed checks.

The earlier 1.0.0 / code 1 APK and its verification remain preserved in
`C:/Users/User/Downloads/upload/cnine-card/output/onestore-20261026/`.
This Android product uses the native WebView client. The separate `/onestore/`
H5 SDK product and its registration are not changed by an APK rebuild.

## Scope and preservation

The APK omits prediction, clan prison camp/death-game UI, server-support navigation,
donation products, purchase/application history, season-pass entry, donation messages
and related unread counts. Requests for these APIs/assets are blocked in both the
WebView transport and the bundled web entry. The donor pet application UI is disabled.
The normal inventory and existing server entitlements are retained.

Messages are filtered in memory for this APK. There are no delete/hide/mark-read calls
for excluded records. Bulk message cleanup is disabled to prevent it from affecting
excluded shared-account messages. Ordinary visible messages retain their normal controls.
Existing server penalties are not cleared; affected accounts see a generic restriction
screen instead of entering the removed facility.

APK packaging leaves website files, original Windows/Android clients, ownership
and reward ledgers unchanged. The separately requested registration fix was
deployed to the shared server; no production test account was created.
Earlier unfinished STOVE/source edits were preserved outside the repository and
reversed before creating this isolated package.

Only 7 APK-local web files are overridden. The build applies the strict client patch
in memory and copies only the small Android skeleton/icons, using installed JDK/SDK
and shared Gradle caches. It does not copy the repository or node_modules.
The separate package ID has separate Android storage and cannot overwrite the
existing direct client. APK executable updates belong to ONE store; direct APK
self-update/download permission and update provider are absent.

## Rebuild

Run from the repository, reusing the task's existing build directory:

```powershell
node scripts/onestore/prepare-apk.mjs 'C:/Users/User/.codex/tmp/reverse-call-onestore-20261026' 'C:/Users/User/.codex/tmp/reverse-call-android-native-20261017'
./scripts/play-store/build-android.ps1 -ProjectDirectory 'C:/Users/User/.codex/tmp/reverse-call-onestore-20261026' -ToolsDirectory 'C:/Users/User/.codex/tools/soopketmon-android' -SigningDirectory 'C:/Users/User/.codex/secrets/soopketmon-play' -ApkOnly -RequireExistingKey -ExpectedCertificateSha256 '1A:16:4D:EA:3A:2B:E5:F9:FA:53:AE:10:7E:D0:B7:5E:5E:A5:65:86:23:7B:DD:F2:73:E4:76:28:6C:24:1E:15'
```

Never publish the direct distribution's APK/update feed as this product.
Future changes require increasing the ONE store versionCode and rebuilding/reviewing
this store package. The source patch fails on changed context instead of silently
re-enabling excluded functionality.

## Validation

- Release assemble + Android lint passed (0 errors, 56 warnings, mainly inherited
  obsolete/unused template resources; warnings are retained in the delivery report).
- 5 JS policy tests, 31 native/JVM checks (including real public manifest merge and
  bundled cache hash validation), 33 Chromium checks using the exact APK web files.
- Mobile and desktop menus, message filtering/counts, direct navigation, blocked
  API requests, ordinary inventory and Android Back script checked.
- Browser fixture uses the built version, blocks real WebSockets, supplies the
  current wallet response and records missing assets (final run: 0 missing).
- No real account used; browser APIs were isolated fixtures; real server writes 0.
- APK signature, package/version, INTERNET-only permission, non-debug release,
  all 7 bundled file hashes verified after packaging.
- Original runtime and direct-client tracked files have an empty Git diff.
- Android hardware/emulator was not connected; install/login on an actual Android
  device remains untested. Chromium checks are not represented as device tests.
- Store upload/review submission has not been performed.

Reports, screenshots, lint output, R8 mapping and APK checksums:
`C:/Users/User/Downloads/ReverseCall-ONEstore-1.0.2-review-20261030/`.
Current review record: `docs/qa/onestore-android-review-20261030/README.md`.
