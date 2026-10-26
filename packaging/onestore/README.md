# ONE store APK — 2026-10-26

This is a separate permanent distribution of 리버스콜. It is not a review-only mode.
All accounts use the same restrictions before and after store review.

- Package: `kr.yakcode.reversecall.onestore`
- Version: 1.0.0 / versionCode 1
- Android: minSdk 24, targetSdk / compileSdk 36
- Signature: existing YAKCODE key; APK Signature Scheme v2
- APK SHA-256: `c87c649de7bb38cde81aa0a51081d36396fd344e5b3f07ce418339b1c8555d79`
- APK size: 3,956,751 bytes
- Delivery: `C:/Users/User/Downloads/upload/cnine-card/output/onestore-20261026/ReverseCall-ONEstore-1.0.0.apk`

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

Website files, original Windows/Android clients, databases, ownership and reward
ledgers are unchanged. No production deployment or database operation was run.
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

- Release assemble + Android lint passed (0 errors, 61 warnings, mainly inherited
  obsolete/unused template resources; warnings are retained in the delivery report).
- 5 JS policy tests, 31 native/JVM checks (including real public manifest merge and
  bundled cache hash validation), 33 Chromium checks using the exact APK web files.
- Mobile and desktop menus, message filtering/counts, direct navigation, blocked
  API requests, ordinary inventory and Android Back script checked.
- No real account used; browser APIs were isolated fixtures; real server writes 0.
- APK signature, package/version, INTERNET-only permission, non-debug release,
  all 7 bundled file hashes verified after packaging.
- Original runtime and direct-client tracked files have an empty Git diff.
- Android hardware/emulator was not connected; install/login on an actual Android
  device remains untested. Chromium checks are not represented as device tests.
- Store upload/review submission has not been performed.

Reports, screenshots, lint output, R8 mapping and APK checksums:
`C:/Users/User/Downloads/upload/cnine-card/output/onestore-20261026/`.
