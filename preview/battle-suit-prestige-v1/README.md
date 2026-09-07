# PROJECT V V3 — White/orange suit resource review

Status: **USER_APPROVED_20260908 / H-BODY LIVE CONNECTION APPROVED**. Only the user's selected white/orange twin-antenna suit is published. The cancelled winged suit is not in the manifest or UI. This independent preview uses the real H-BODY V3 catalog and production atlas paths, but never calls account, damage or reward APIs.

## Deliverables

- One tall, slender, human-worn white/orange armor design with six existing weapons.
- Six true RGBA combat sprites, three 1536 × 1024 V3 atlases, muzzle and sole-pivot metadata.
- M200: integrated shouldered full-body pose **approved by the user on 2026-09-08**. Its generated source is immutable; only connected-background removal and uniform whole-figure scaling are applied. Long sniper proportions are preserved.
- SKS: the generated weapon redesigns and the short V5 fit were rejected. V6 copies the **original weapon raster**, flipped, proportionally enlarged from 666 to 840 source pixels and rotated as a whole by +6° to level its apparent bore axis (0.073°). Barrel, receiver, sight, magazine and stock are never redrawn or stretched.
- Gold anti-materiel: V6 copies the original gun raster at 980 source pixels (70% of body height) instead of the short shared-proxy fit. Its bore is horizontal. Both larger guns have newly fitted support-arm poses behind fixed silhouettes; the actual weapon PNGs are composited offline with foreground fingers.
- Gold assault rifle: V7 copies the complete original raster at 900 source pixels (64% of body height), with a level bore and newly fitted support hand in front of the magazine. No AI gun redraw, barrel-only extension or nonuniform scaling.
- M4A1 and AK reuse the original raster assets with the existing exact-weapon compositor.
- Actual shared AccountBattleUnit / BallisticVFX renderer. Local firing only, no damage/rewards APIs and no audio.

## Rebuild

```powershell
node preview/battle-suit-prestige-v1/build-assets.mjs
node scripts/build-h-body-resources-v2066.mjs
node preview/battle-suit-prestige-v1/build.mjs
npm run build:v3
npm run test:battle-suit
```

The builder uses the existing connected-light-background script for the approved M200, the existing exact-weapon compositor for unchanged weapons, and fixed-source-coordinate SKS / gold rifle compositions with hand occlusion. Proportional scale and whole-gun rotation are specified in exact-weapon-fit.mjs. The compositor's new opt-in flags preserve separated support arms and allow row Y calibration; all defaults remain unchanged.

Ready/fire/recoil/recover reuse one static aiming pose per weapon, as in the current V3 resource policy. Idle motion and muzzle/tracer/impact are runtime effects, not four separately drawn articulated poses.

Original generated sources are preserved under assets/sources. Final resources are in assets/sprites and assets/atlases. High-resolution transparent composites: helios-sks-exact-full-v6.png, helios-gilded-ar-exact-full-v7.png and helios-gilded-antimateriel-exact-full-v6.png. Rebuild intermediates, cancelled winged assets and rejected SKS attempts remain local/ignored and are not published.

## Verification and scope

Asset tests verify source hashes, approved M200/SKS/gold heavy sprite immutability, larger gun-to-body ratios, nearly horizontal bore axes, exact-raster barrel pixels, real alpha, frame padding, static frame repetition and preview isolation. Existing 18 live suit/weapon pairs and their atlases remain unchanged. H-BODY adds six profiles to the shared resolver; no new combat renderer or damage rules are introduced.

The user approved the previously reviewed weapons, requested a larger gold AR, and authorized the complete resource set through live deployment. Prompts and the built-in image-generation mode are recorded in PROMPTS.md.

## Live catalog and item resources

- Equipment: `BATTLE_SUIT_H_BODY` / **H-BODY**, item art `/assets/items/h-body-v2066.png` and separate unarmed V3 fallback `/assets/ui/project-v/account-battle-suits/suits/h-body-v2066.png`.
- Material: `SUIT_CORE_4` / **슈트 코어 4**, `/assets/items/suit-core-4-v2066.png`. Classified as MATERIAL; available to CMS inventory grants and optional Prime box pool configuration.
- Single live resource manifest: `/assets/ui/project-v/account-battle-suits/h-body-v2066.json`. Its six production atlases are byte-identical to the approved preview atlases.
- No balance was specified. Initial H-BODY PVE power is 0 and PVP power is always 0. OWNER sets PVE power and acquisition in CMS. No automatic grants, drops, supply weights or recipes are added; existing recipes remain unchanged. Resource migration preserves later CMS balance edits.
- Durable compositing rules are recorded in AGENTS.md and docs/project-v-account-battle-suit-standard.md.
