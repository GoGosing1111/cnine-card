disposition: fix

Full review after the rejected implementation was rebuilt. Code-led extension of the approved game world; no approval comp or separate QUALITY BAR card was supplied or required for this scoped extension. PRODUCT.md was read from `git show HEAD:PRODUCT.md` because the sparse working tree omits it. No browser operation, source edit, detector rerun, or account write was performed by this reviewer.

## persistence

Pass. The committed PRODUCT.md records the browser RPG, the workshop task, the user's selection/material/cost/probability priority, and server ownership of costs, probabilities, stock and receipts. `.impeccable/surfaces/js-workshop-v1881-js.md` persists the five direction blocks and identifies the approved codex panel/action resources. The governing navy-metal/lime game UI directive is treated as authority over the preceding rejected surface interpretation. This is an extension, so no new global identity, comp approval or concept-seed gate is imposed.

Evidence checked: all 27 required standalone captures (seven categories plus X-BODY shortage and expanded selection, at 1440 Chromium / 390 WebKit / 320 Chromium), all 14 shell category captures, and all four shell shortage/selection captures. Each file shows its named state at the expected width, with loaded art and no blank capture failure. Standalone report timestamp: 2026-11-06T13:30:41Z; final shell report: 2026-11-06T13:31:57Z. Shell images are viewport captures of the actual application shell, not full-length captures of its nested scroll region. The standalone full-length captures provide the below-fold workbench evidence. Both reports declare productionWrites: 0. Supplied detector result is `[]`; it was not rerun.

Source sampled: `js/workshop-v1881.js` (header/navigation, catalogue and breakpoint listener, synthesis presentation, workbench composition, binding/focus flow), all of `js/workshop-recipes-v1.js`, and `css/workshop-workbench-v1.css`. The focused Git diff puts changes in presentation and binding/layout regions; the crafting API/receipt handlers are outside the changed hunks. The parent reports 44 actual-main desktop checks, 108 accounted-for workshop checks, standalone profiles and payment/retry checks passed, and 15 referenced existing common resources preserved byte-for-byte and included in shipping via asset-provenance.json. This review does not convert those reports into an independent runtime, asset-hash audit or production-transaction claim.

## fidelity

| Element / promise | Classification | Evidence and implication |
| --- | --- | --- |
| THESIS: illustrated catalogue plus crafting workbench | match | All seven categories now use a catalogue and a distinct output/order stage. The new stage is materially different from the rejected generic single panel. |
| OWN-WORLD / MATERIAL | match | `panel-v3.webp` and `action-user-approved.webp` are referenced as actual nine-slice resources. Their metal corners and lime action surfaces are visible. Real currency, category and item artwork is used; the chamber is visible behind the product stage. The header anvil is a small authored geometric SVG, not a stand-in for a promised raster illustration. |
| TYPE | match | Pretendard/incumbent Korean game font stack, plain readable labels, differentiated result title/probability/body scale. Shell typography inherits the actual game's treatment. No invented display lettering or decorative system-face substitution is introduced. |
| GROUND | match | Navy field and navy metal panels conform to the contract's #091321 ground; the result/order regions remain readable against it. The selected category and executable action share the approved lime treatment. |
| STORY / desktop layout | match | 254px illustrated catalogue and split product/order stage are present across all seven categories. Output artwork is substantially larger than before and sits in a recognizable workshop environment. |
| STORY / mobile illustrated choice | match | All seven image categories stay visible. Native details/summary identifies current art and name; expanded 390/320 captures show two-column image recipe choices, selected treatment and secondary filters. The former text-only recipe selects are gone. |
| Prior requirement 3: one requirements table | match | Vehicle, synthesis, material, suit, core, equipment and mercenary views each have one material/currency set. Synthesis separately identifies bulk totals rather than repeating its one-attempt table. The appended mobile duplicate summary has been removed. |
| Prior requirement 4: output art and metadata | match | Output art preserves its aspect ratio. Success quantity is shown, material/core stock is shown where supplied, and supplied PVE/PVP values survive on mobile. Equipment sacrifice remains a separate input block. Mercenary output uses the card unit. |
| Prior requirement 5: common judgment hierarchy | match | Every category has output > common order header/probability > requirements > failure policy > action. Limited stock and equipment pity remain in their relevant order flow. X-BODY shows 9 owned / 10 required / 1 missing and a disabled action. |
| FIRST VIEWPORT / narrow reflow | adaptation | The contract expressly uses mobile disclosure and a stacked workbench. The shell's top/bottom navigation reduces the first viewport; selecting a recipe moves focus/scroll to the workbench in source. The entire long equipment flow is not falsely treated as fitting one screen. No horizontal clipping is visible at 320. |
| Keyboard/focus and busy state | adaptation | Native buttons/details/select semantics remain. Source restores search focus/caret, declares pressed category/recipe/payment state, disables transaction controls while busy and focuses the selected workbench after mobile recipe selection. These source-level protections do not prove an independently executed keyboard session. |
| Mobile-to-desktop catalogue transition | match | The breakpoint listener at `js/workshop-v1881.js:186` sets the existing catalogue open when crossing beyond 800px, before later renders preserve its state. The desktop summary is intentionally inert because the catalogue is already open. An initial concern based on the composition function alone was withdrawn after reading this listener; it is not a required fix. |
| WebKit equipment selection readability | contradicted | `review/390-ITEM_SYNTHESIS.png` shows the selected +10 equipment as near-white text on a white native select at roughly y=815. The 1440 and 320 Chromium controls are dark/readable. Choosing the sacrificed instance must remain legible on WebKit. |

The five earlier rebuild requirements are structurally addressed. The contradicted WebKit control row is a bounded finish defect, not grounds for another visual rebuild.

## ceiling

Reached for this code-led extension's requested visual commitment: approved panel/action material, persistent image categories, illustrated catalogue, visible chamber and larger output art are now genuinely on screen. Further decorative plates, new character art or global restyling are not needed to satisfy the request. The remaining ceiling is control readability in the material fix below.

## material_fixes

1. **[P1 · Floor/readability]** Normalize the WebKit `#wsCraftEquipment` select in `.ws28-forge-config`: preserve the native selection semantics and existing change handler, but use an explicit readable foreground/background with native appearance suppressed and a consistent visible dropdown affordance. Verify the selected option, disabled state and keyboard focus in 390 WebKit, including the actual shell at the control's scroll position; retain the dark readable 1440/320 treatment. Evidence: `review/390-ITEM_SYNTHESIS.png`; `css/workshop-workbench-v1.css` select rules.

## keep

Keep the approved navy/lime raster resources, real image categories and recipe choices, single cost table, output metadata, common probability position, explicit sacrifice/pity/limited-stock policies, and existing server transaction/receipt/approved-art boundaries while applying this fix.
