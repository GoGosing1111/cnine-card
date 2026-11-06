---
version: 1
slug: "js-workshop-v1881-js"
primary_target: "js/workshop-v1881.js"
related_targets: ["css/workshop-workbench-v1.css","js/workshop-recipes-v1.js"]
---

# Workshop visual rebuild after user rejection

Mode: Operate. Code-led extension of the approved game UI, not a replacement global visual system.

User rejected the preceding information-only refresh: "ui도 바꾸고 아이콘 사용할거 있으면 하라고 한건데 뭐한거임". Priority remains "제작 편의: 선택·재료·비용·성공률을 한눈에".

THESIS: An illustrated catalogue and a real crafting workbench. Identify a result from its art, read one set of required/owned/shortage figures and its probability, then craft.

OWN-WORLD: Project AGENTS 2026-10-24 pins the approved codex navy metal panel and lime action raster as the common UI. Use panel-v3.webp (48/16 nine-slice) and action-user-approved.webp (38/9), real item/category/currency artwork and existing workshop chamber. Preserve all approved source bytes. Pretendard and the incumbent game font stack. Navy #091321, text #eff5ff, secondary #b6c9dd, lime #c8ff6b, shortage #ffb3a9. No new decorative images or global design-system replacement.

STORY: Seven illustrated categories stay visible. Desktop catalogue and workbench sit side by side. Mobile catalogue is a native disclosure with current art/name; expanded content contains image buttons and secondary search/filter controls. Selecting an image opens the current workbench and moves focus there. All seven categories follow output > probability > exact requirements > failure policy > action. Equipment sacrifice/pity and limited stock remain visible in their relevant flow.

FORM: User-pinned game resource system and task structure. No concept lottery needed. Replace previous plain panels, line-icon category bar, native recipe dropdown and duplicate mobile summary. Existing transaction/receipt handlers, recipe rules, assembly/reveal and retry keys stay unchanged.

FIRST VIEWPORT: Framed illustrated category buttons and a compact illustrated catalogue summary on phones; a large output illustration and one cost table occupy the workbench. Desktop has a 254px catalogue and split product/order stage. The actual action uses the approved lime button resource, with a navy disabled state.

FINISH: Fresh full review of all seven categories at 1440 Chromium, 390 WebKit and 320 Chromium; expanded image selector, missing resource state and payment/retry checks. Keep raster provenance in a source-hash inventory, without altering approved bytes. Existing global design files remain untouched; document this local extension and verification in QA.
