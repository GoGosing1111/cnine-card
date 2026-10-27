# Defense boss HP placement — 2026-10-27

The boss status panel used an absolute position inside the combat canvas (53px from the top on mobile), allowing it to cover player HP bars as the camera moved. It now occupies a separate row above the battlefield viewport, immediately below the lane navigation. The existing canvas and its camera controls, minimap, loading and revive overlays remain together inside the viewport. The row collapses when no boss or attack warning is present; Pixi resizes to the remaining space.

Both the canonical `/defense/` page and the preview use the same markup. The image-skin cache query and its generator are updated. No JavaScript bundle, combat calculation, boss timing, reward, entry limit, account or operating policy is changed. Standalone ONE store documents are transformed from the canonical page by the existing server route.

Verified using the real shipped battle bundle and isolated local room API: previous overlay reproduced, 10W boss with partially depleted player HP, 1440×900 desktop, 390×844 and 320×568 mobile, 844×390 landscape, canvas resize, camera pan/lane/overview controls, and full height restoration when the boss disappears. No horizontal overflow or browser errors. The boss panel is geometrically outside the canvas at all four sizes, protecting every HP bar drawn inside it.

Screenshots, browser report, review script and deployment evidence: `C:/Users/User/.codex/visualizations/2026/10/27/01a17c24-d14c-7e83-ad02-1c5ec80427fe/defense-boss-hud-20261027/`.

Release verification used the existing monster-defense-content regression (3/3 passed) and the standard scoped release and Hyperdrive guards.

## Production completion

- Release source `d4c64d4ae71a0fc39dc47589af3e05a7566837bb`, based on the then-current production `1f242edf3fb1bac462739d040e16ff851f6fb704`.
- Pages `073441e3-d617-4f76-b3cf-7031a3ea2d75`; deployment command completed 2026-10-27 16:15:57 KST. Public verification completed at 16:16:15 KST.
- All three changed public HTML/CSS files returned HTTP 200 with the exact release hashes. API runtime and scheduled Worker versions were verified at 100%.
- The deployed HTML/CSS were rechecked in a 390×844 browser using the isolated local room API; boss HP remains above the combat canvas, player HP and controls render, and no browser error or horizontal overflow occurs. This is a deployed-file browser check, not a production-account battle.
- Production account, reward, entry-count and settings writes: 0. The sparse release checkout reuses existing dependencies; no full project or dependency copy was created. No storage-maintenance task or worktree archive was performed.
- Full deployment and public-file/browser evidence is retained in the evidence directory above.
