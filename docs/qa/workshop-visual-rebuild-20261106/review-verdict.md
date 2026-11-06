## verdict

1. **Resolved — WebKit equipment-select readability.** The refreshed `review/390-ITEM_SYNTHESIS.png` now shows the selected +10 equipment in readable light text on a dark field, with a visible lime dropdown chevron. Its `390-equipment-select-focus.png` and `390-equipment-select-disabled.png` counterparts preserve the selected name; focus has a distinct lime outline and disabled text remains legible with a subdued palette. The corresponding 1440 and 320 base/focus/disabled captures retain the same usable treatment without clipped text or an obscured affordance. `shell-mobile/390-equipment-select-focus.png` and `390-equipment-select-disabled.png` confirm the fix at the control's actual scroll position in the game shell, clear of the fixed navigation.

The scoped CSS at `css/workshop-workbench-v1.css:121` suppresses native appearance, sets explicit dark background/light text and keeps the native select element. Required verdict evidence exists and matches its state: standalone control captures were written between 2026-11-06T13:37:47Z and 13:38:02Z; shell control captures are final at 13:38:07Z / 13:38:08Z. All 11 scoped captures were opened. No browser, source mutation, additional detector run or new defect hunt was performed. The parent reports computed-style/selected-name assertions, keyboard ArrowDown/Escape and recipe pointer/Enter checks passed; these are supplied runtime evidence, not a claim that this reviewer independently executed those interactions.

Fix-batch regressions observed in the reviewed scope: none. The existing breakpoint listener and its additional mobile-only state-restoration guard were not promoted into a new review requirement.

## remaining

Clear. This ship verdict covers the one scored material fix from `full-review.md`; the complete surface review remains recorded there.

disposition: ship
