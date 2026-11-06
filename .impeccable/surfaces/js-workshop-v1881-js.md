---
version: 1
slug: "js-workshop-v1881-js"
primary_target: "js/workshop-v1881.js"
related_targets: ["css/workshop-workbench-v1.css","js/workshop-recipes-v1.js"]
---

# Workshop usability refresh

Mode: Operate. Existing web game, existing navy/lime workshop identity. User requests full workshop UI audit and resource improvements using the UI skill; confirmed priority is selecting a recipe and understanding materials, cost and probability together. Code-led, narrowly specified workflow revision within the existing game. Preserve transactions, approved art, assembly/reveal and recipe policy.

## Direction contract

THESIS: One selected recipe, one legible decision area: identify the output, read what will be consumed, see the chance and act. Remove decorative facility numbering and competing headings.

OWN-WORLD: Retain the game's midnight navy workbench, pale blue text and lime selection/action color. Reuse actual approved item art; use a consistent small stroke icon family for categories and currencies. Strong alignment and readable figures carry the interface.

STORY: Choose a category and recipe, distinguish owned stock from required cost and shortage, check probability and failure policy, then craft. Search, readiness, pending recovery and limited stock stay truthful.

FIRST VIEWPORT: Desktop has category navigation, a searchable 260px recipe list and a larger selected recipe workspace. On phones, a native recipe selector replaces the tall scrolling list. Compact output art sits next to the title and probability; requirements and the actual action follow in the same column. A mobile “제작 조건 보기” shortcut moves focus to the selected work area without spending resources.

FORM: Existing master/detail workbench, fixed by the confirmed task and incumbent world; no concept lottery. Seed: not applicable (specified existing workflow). Signature interaction: changing the recipe keeps search and selection focus while updating the same requirement view; mobile selection moves directly to the chosen recipe. Respect reduced motion; existing receipt-driven reveal is the sole major animation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Documentation scope: retain incumbent design; record this surface's implementation in QA notes without replacing the game's global visual system. No new shipping raster artwork is planned; approved originals remain untouched.
