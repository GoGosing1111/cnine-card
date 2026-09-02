# Apocalypse boss ultimate V2 provenance

- Generated with the built-in OpenAI image generation tool on 2026-09-02.
- The V1 4x3 timing sheet was supplied only as a layout/timing reference. The V2 artwork was redrawn.
- The selected generated RGBA sheet was normalized with `scripts/build-v3-live-style-event-fx-v2.mjs` into the production 2048x1365, 12-frame Pixi atlas.
- The recorded V1 combat SFX remains byte-identical; only the visual resource and presentation routing changed.

## Final generation prompt

```text
Use case: stylized-concept
Asset type: production game VFX sprite sheet replacement for a PixiJS WebGL boss skill
Input images: Image 1 is the current 4-column x 3-row, 12-frame atlas and is a layout/timing reference only; redraw the visual content.
Primary request: create a new Apocalypse boss ultimate impact sprite sheet with exactly 12 sequential frames arranged in exactly 4 columns x 3 rows. The sequence builds from a compact black-red singularity and thin crimson warning runes, snaps into a violent dark-red ground rupture at frame 6, then collapses and clears rapidly by frame 12.
Style/medium: premium authored 2D game VFX, crisp hand-painted energy shapes, sharp silhouettes, dark occult sci-fi apocalypse visual language.
Composition/framing: each cell is one independent frame; keep the effect centered with generous clear margins; no artwork may cross cell boundaries; consistent center and scale across the sequence.
Lighting/mood: black core, deep blood red, crimson, ember orange, very limited muted violet; high contrast against a dark battlefield.
Constraints: genuinely transparent background and preserved alpha; exact clean 4 x 3 grid; frame 1 minimal anticipation, frames 2-5 controlled build, frame 6 unmistakable collision peak, frames 7-12 rapid dissipation; no text, no characters, no UI, no frame borders, no checkerboard, no watermark.
Avoid: white energy, white flash, gray or white smoke, pale dust, fog, cloudy bloom, washed-out highlights, broad translucent afterimages, long lingering trails, lens flare, full-screen haze, light pillars, video-cinematic composition. Keep almost all luminous pixels red/orange/purple and keep the final two frames nearly clear.
```

The second built-in pass removed the black background only and produced the selected transparent source sheet. It preserved the frame layout and artwork while forbidding white/gray additions.
