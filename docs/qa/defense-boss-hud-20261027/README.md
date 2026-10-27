# Defense boss HP placement — 2026-10-27

The boss status panel used an absolute position inside the combat canvas (53px from the top on mobile), allowing it to cover player HP bars as the camera moved. It now occupies a separate row above the battlefield viewport, immediately below the lane navigation. The existing canvas and its camera controls, minimap, loading and revive overlays remain together inside the viewport. The row collapses when no boss or attack warning is present; Pixi resizes to the remaining space.

Both the canonical `/defense/` page and the preview use the same markup. The image-skin cache query and its generator are updated. No JavaScript bundle, combat calculation, boss timing, reward, entry limit, account or operating policy is changed. Standalone ONE store documents are transformed from the canonical page by the existing server route.

Verified using the real shipped battle bundle and isolated local room API: previous overlay reproduced, 10W boss with partially depleted player HP, 1440×900 desktop, 390×844 and 320×568 mobile, 844×390 landscape, canvas resize, camera pan/lane/overview controls, and full height restoration when the boss disappears. No horizontal overflow or browser errors. The boss panel is geometrically outside the canvas at all four sizes, protecting every HP bar drawn inside it.

Screenshots, browser report, review script and deployment evidence: `C:/Users/User/.codex/visualizations/2026/10/27/01a17c24-d14c-7e83-ad02-1c5ec80427fe/defense-boss-hud-20261027/`.

Release verification uses the existing monster-defense-content regression and the standard scoped release guards. Production deployment is recorded separately after it succeeds.
