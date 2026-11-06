# Workshop UI finish verdict — fix round 1

## Verdict

Scope: the five findings from the initial finish review only. Reopened all 21 required captures at 1440 Chromium, 390 WebKit and 320 Chromium under `operations/coin-100quadrillion-20261106/source/.impeccable/review/`. All captures are valid and match their named category and width.

| Finding | Score | Evidence |
|---|---|---|
| Mobile recipe selection moves to the newly rendered workspace | resolved | `js/workshop-v1881.js:602` invokes the existing recipe action, then queries the new `#wsSelectedRecipe`, focuses it and scrolls it on mobile. Desktop focus/caret restoration remains separate. Browser interaction checks were reported passed by the builder; this reviewer used source evidence and did not operate a browser. |
| Selected output, probability and current costs appear together | resolved | All 14 mobile recaptures show the compact decision summary before the detailed controls. Required/owned/shortage values are readable; equipment input is included. `mobileDecisionSummary()` uses current payment and attempted quantity. Detailed sacrifice, pity, quantity and action remain below. |
| Suit caption overlap and displaced probability | resolved | Both mobile `BATTLE_SUIT_CRAFT` recaptures show one non-overlapping output/title/rate summary. The desktop title/rate layout remains intact. |
| Equipment probability label | resolved | `1440-ITEM_SYNTHESIS.png` visibly says “기본 성공 확률”; both mobile captures visibly say “1회 성공 확률.” The guaranteed-state text remains conditional in source. |
| Mercenary selected/disabled frame fill | resolved | All three `MERCENARY_CRAFT` captures show a muted navy disabled action without the bright frame fill; the desktop selected recipe uses the scoped lime/navy treatment. |

No material regression attributable to this fix batch was observed in the supplied captures. This is a scored-fix verdict, not a new whole-surface audit.

## Remaining

Clear for these five findings. Full app shell integration, real-device behavior, live transactions and final documentation are outside this verdict. Preserve approved art and recipe policy; no game code was edited by this reviewer.

disposition: ship
