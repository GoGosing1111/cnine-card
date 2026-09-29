# SSS Reroll Ticket — Coming Soon

- Date: 2026-09-29
- Request: premium English SSS reroll-ticket launch teaser; verify SSS mercenary resources first.
- Generator: built-in `image_gen.imagegen`; one generation with four local source-art references.
- Output: `sss-reroll-ticket-coming-soon-en-v1.png` (native PNG, preserved without re-encoding).
- Roster check: `origin/main` at `df9e9e9ca78834460811fbe7aba6d47d218a55bf`, `assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json`.
- Characters: Omega-X (V-021), Ragniel (V-046), Cryvern (V-049), Berkan (V-055); all four listed as SSS in that roster.
- Source artworks read from existing `s-body-assembly/cnine-card` worktree. Source files remain unchanged. The unapproved Morgas and Karvein concepts were not used.
- English copy: SOOPKETMON / SSS / REROLL TICKET / COMING SOON.
- Visual review: all four characters distinguishable; gold celestial armor, red-haired masked winged swordsman, blue crystal swords, and black-gold archer identities checked. English text checked, no clipped headline or footer. No release date, price, rate, or guarantee added.
- Scope: standalone promotional poster only. No game runtime, shop, API, release flags, or source-art master changed.

## Reference images, in input order

1. `C:/Users/User/.codex/worktrees/s-body-assembly/cnine-card/assets/ui/project-v/mercenaries/mercenary-v021-omega-x-source-art-v1.jpg`
2. `C:/Users/User/.codex/worktrees/s-body-assembly/cnine-card/assets/ui/project-v/mercenaries/approved-20260919/mercenary-v046-ragniel-source-art-v1.png`
3. `C:/Users/User/.codex/worktrees/s-body-assembly/cnine-card/assets/ui/project-v/mercenaries/cryvern-source-art-v1.png`
4. `C:/Users/User/.codex/worktrees/s-body-assembly/cnine-card/assets/ui/project-v/mercenaries/approved-20260927/berkan-source-art-v1.png`

## Final prompt

```text
Use case: ads-marketing.
Create one finished, exceptionally premium fantasy game launch-teaser POSTER, portrait 2:3, ideally 2048 x 3072, with immaculate English typography. This is the SSS REROLL TICKET coming-soon poster for SOOPKETMON / PROJECT V.

The four supplied images are the ACTUAL SSS mercenary source-art assets, not generic style suggestions. Build a polished cinematic ensemble COMPOSITE using these exact identities. Preserve their recognizable helmets, faces, armor structures, palette, weapons and high-end painterly game-illustration appearance. Do not invent or replace these characters:
Image 1: Omega-X, full closed sharp gold helmet with orange-red light, dark cosmic armor edged in brilliant gold, orange chest core, celestial greatsword and a dark singularity with orbital gold rings.
Image 2: Ragniel, adult male red hair, eyes visible above a white-gold half-face mask, elegant white and champagne-gold armor, luminous feathered wings, very long gold sword.
Image 3: Cryvern, closed dragon-like silver helmet with sapphire-blue eye slit, silver faceted armor with icy-blue crystals, blue crystalline swords.
Image 4: Berkan, full closed black-gold horned helmet, black obsidian plate with flowing gold inlays, enormous distinctive curved black-and-gold BOW, one gold arrow. Preserve him as an archer, never give him a sword.

Art direction: collector-edition prestige campaign, powerful and opulent but disciplined. Deep ink-black, rich midnight navy, warm champagne-gold, touches of the characters' original ice blue and violet. Beautiful controlled light, rich shadow, selective precise metallic edges, refined cinematic depth. Four recognizable characters in a tightly art-directed monumental ensemble across the upper 65% of the poster, with generous clear silhouettes and readable upper bodies. Omega-X and Ragniel form the principal central pair; Cryvern and Berkan flank them at slightly smaller scale, all four clearly visible. Heads and distinctive weapons never merge. Preserve Ragniel's face; the other three stay fully helmeted. The original source artwork should remain clearly recognizable; avoid generic redesigned costumes. A single thin eclipse-like gold arc frames the ensemble in a dark atmospheric cathedral/celestial space, with sparse suspended gold dust and subtly layered haze. Avoid hundreds of sparks and overexposure. Do not put each character into a box, card frame, or separate panel.

A single compact premium SSS reroll ticket floats in the lower foreground, angled slightly in perspective, with a black enamel center, champagne-gold engraved rim, two elegant circular reroll arrows and a legible small 'SSS'. It should connect the item to the mercenaries without competing with their faces or the main title. This is a promotional item visualization, not a screenshot of a shop.

Typography is a major part of the design. Use only the following exact English text, spelled flawlessly:
Small, widely tracked masthead at top: "SOOPKETMON"
The lower third is a deliberately calm dark typography field blended naturally into the illustration:
VERY LARGE main headline: "SSS"
Directly below, crisp substantial uppercase: "REROLL TICKET"
Near the foot, widely tracked and clearly legible: "COMING SOON"
A sophisticated high-contrast carved serif for SSS, champagne metallic foil with restrained bevel; elegant precise uppercase lettering for REROLL TICKET, beautifully kerned; clear ivory-gold lettering for COMING SOON. Strong visual hierarchy and exceptional mobile thumbnail readability. Keep text away from characters' faces and main weapon details. Full title should dominate the lower third, not become a tiny caption. Balanced intentional margins, fine editorial alignment, no fake paragraphs or filler text.

Constraints: exactly these four characters, no added characters, no SD/chibi sprites, no photography, no watermarks, no new logos, no dates/prices/odds/guarantees, no 'available now', no Korean text, no CTA buttons, no stat panels, no UI dashboard, no cartoon coupons, no garish rainbow gradients, no excessive filigree, no cluttered border. Deliver a single complete flat poster image ready to share, not a poster photographed on a wall.
```

## File verification

```text
{
  "Width": 1024,
  "Height": 1536,
  "Bytes": 3437476,
  "SHA256": "8A466E5DB43E642DD9ACD5ED5CA6C1D6E2251F7CCFB5A30C3B722CA90921205B"
}
{"Path":"assets/ui/project-v/mercenaries/mercenary-v021-omega-x-source-art-v1.jpg","SHA256":"F7AE2726C2B445201F344518DA687CA12C7D5D0FB9E0D1954554F21677DF8117"}
{"Path":"assets/ui/project-v/mercenaries/approved-20260919/mercenary-v046-ragniel-source-art-v1.png","SHA256":"B6EC66166A3AF153A9A6BAB827C0FE998E94855B16F67E0683BBFF4B0CCD0F89"}
{"Path":"assets/ui/project-v/mercenaries/cryvern-source-art-v1.png","SHA256":"321600E04E4CDB3ABD9D35CCEEFCF4AFBD9F34AED73ABD5A8AD038123A999535"}
{"Path":"assets/ui/project-v/mercenaries/approved-20260927/berkan-source-art-v1.png","SHA256":"E782A14D37A115ABA29D46F13D2443DBF5761A7DD99DCDA816B9908BA896507D"}
```
