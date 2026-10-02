# Pet opening buff visual resources

Built-in image_gen mode. Five independently generated RGBA sprite atlases, eight frames per buff, with a separate padding correction pass. Source PNG bytes are preserved.

- `manifest.json`: type mapping, source/runtime SHA-256, dimensions and timing.
- `*-atlas-source.png`: original output, 1774×887, 4×2 layout.
- `*-atlas.webp`: 1280×640, eight 320×320 frames, 1.6 seconds.
- `*-icon.webp`: transparent 192×192 icon from frame 4.
- Exact generation/edit prompts: `preview/pet-buffs-v1/prompts.json`.
- Deterministic export: `node scripts/build-pet-buff-resources-20261003.mjs`.

These files define appearance only. They contain no combat values or release switches. The resource viewer, equipment UI and OWNER CMS use them; actual battle activation remains OFF.
