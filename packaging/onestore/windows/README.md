# ONE store Windows distribution — 2026-10-30

Version 1.0.0, x64, app ID `kr.yakcode.reversecall.onestore.windows`.
Installer: `ReverseCall-ONEstore-Windows-Setup-1.0.0-x64.exe`.
Delivery directory: `C:/Users/User/Downloads/ReverseCall-ONEstore-Windows-1.0.0-review-20261030/`.

This permanent distribution shares Android's seven restricted web files. Prediction,
prison camp/death game, donations and season-pass entry are removed for every account.
Electron also rejects the corresponding requests and navigation. Public resource
manifests are verified and merged with the bundled files; future resource updates
cannot replace these files with the ordinary website's versions.

The executable, profile, session partition, app ID and installer GUID are separate
from the ordinary Windows client. GitHub executable auto-update and the unrestricted
website launcher button are removed. Executable updates belong to ONE store.
Existing accounts, shared server data and the ordinary release feed are preserved.

Rebuild in the existing external build directory:

```powershell
node scripts/onestore/prepare-windows.mjs C:/Users/User/.codex/tmp/reverse-call-windows-build-20261018
```

Run that directory's `node_modules/electron-builder/out/cli/cli.js` with
`--win nsis --x64 --publish never`, then call `buildInstaller` exported by
`scripts/build-windows-installer.mjs` with both `source` and `build` set to the staged
directory. Rename the resulting wrapper to `distribution.json`'s filename.
Run `scripts/onestore/verify-windows.mjs <build> <qa-output>` against the finished files.
The shared build dependencies and launcher artwork are reused.

Validation: 32 related unit checks, 28 actual Electron checks with isolated APIs,
real installer install/uninstall in a Unicode path, 41 packaged file hashes and all
7 store web overrides. The current 14,404-file public resource manifest merged
successfully. Final native run: no page errors, no missing resources, no real server
writes. OAuth and real account registration were not exercised by fixture tests.
The reported shared-network registration rejection is a separate server policy.

Installer size: 118,350,848 bytes. SHA-256:
`5650e22e40688d194d9cbd5b60a2b2dfd3931c69719860b3d15cb0d1a7e787ef`.
Windows Authenticode status: **NotSigned**, matching the existing Windows pipeline;
this is not the Android YAKCODE signing certificate. Store upload/review is not done.
Evidence and native screenshots are retained in the delivery directory's `qa/`.
