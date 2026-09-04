# Avatar V1 asset contract

An avatar identity owns two different images. Do not reuse one file for both surfaces.

- Equipment avatar: transparent full-body cutout optimized for a small loadout slot and a readable silhouette.
- Lobby/chief illustration: separate 2:3 cinematic scene with a unique pose, camera, lighting, and environment.
- Identity lock: face, hairstyle, body type, outfit motifs, and primary palette must remain consistent across both images.
- Lobby responsive sources: use the `-1024.webp` image by default and the `-640.webp` image for narrow/mobile layouts.
- Lobby V1 files are art-review assets and are not live until the avatar system explicitly maps an avatar ID to them.
- User-confirmed lobby masters live in `lobby-source-approved/`; equipment alpha masters live separately in `equipment-source-approved/` and must not replace one another.

The equipment drafts are intentionally not production assets until each cutout has a genuine alpha channel and final mobile-size compression.
