// Five independently generated frames, requested on 2026-10-28. Only the
// shared dialogue layout/lifecycle is reused; artwork is character-specific.
export const MERCENARY_AREA_DIALOGUE_CSS=`
.jinmu-dialogue-rail[data-theme^='sss-']{padding:0 12px 3px;background:transparent;--area-name:#cfeaff;--area-line:#f1f6ff;--area-edge:#8ab9cf;--area-rise:0px}
.jinmu-dialogue-rail[data-theme='sss-zero']{--area-frame:url('/assets/ui/project-v/mercenaries/sss-area-dialogue-20261028/zero-frame.webp')}
.jinmu-dialogue-rail[data-theme='sss-prime-requiem']{--area-frame:url('/assets/ui/project-v/mercenaries/sss-area-dialogue-20261028/prime-requiem-frame.webp');--area-name:#ffd7d8;--area-line:#fff1ef;--area-edge:#a65457}
.jinmu-dialogue-rail[data-theme='sss-general-jok']{--area-frame:url('/assets/ui/project-v/mercenaries/sss-area-dialogue-20261028/general-jok-frame.webp');--area-name:#f5d694;--area-line:#fff7e7;--area-edge:#aa8548;--area-rise:5px}
.jinmu-dialogue-rail[data-theme='sss-cardgu']{--area-frame:url('/assets/ui/project-v/mercenaries/sss-area-dialogue-20261028/cardgu-frame.webp');--area-name:#f2d5a2;--area-line:#fff5e6;--area-edge:#9b7b49}
.jinmu-dialogue-rail[data-theme='sss-revan']{--area-frame:url('/assets/ui/project-v/mercenaries/sss-area-dialogue-20261028/revan-frame.webp');--area-name:#f0b5b8;--area-line:#fff0f1;--area-edge:#894149;--area-rise:14px}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-frame{max-width:1120px;padding:0;background:none;clip-path:none;border:0 solid transparent;border-inline-width:115px;border-image:var(--area-frame) 0 520 fill /0 115px stretch}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-frame:before,.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-frame:after,.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-crest,.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-face:after{display:none}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-inner{min-height:166px;padding:53px 9px 49px;gap:14px;position:relative;background:none;clip-path:none;box-shadow:none;transform:translateY(var(--area-rise))}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-face{flex:0 0 48px;width:48px;height:48px;padding:1px;border:1px solid var(--area-edge);border-radius:3px;box-shadow:0 0 11px #0008;background:#07090c;overflow:hidden}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-face>i{border-radius:2px}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name{align-items:baseline;gap:12px;flex-wrap:nowrap;margin-bottom:4px}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name b{flex-shrink:0;color:var(--area-name);font-size:13px;letter-spacing:.035em}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name span{min-width:0;font-size:10px;letter-spacing:0;color:#9ba4af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-copy p{color:var(--area-line);font-size:17px;line-height:1.5;font-weight:550;text-shadow:0 2px 4px #000}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-seal{flex:0 0 62px;min-height:0;border:0;color:var(--area-name)}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-seal b{font:600 18px/1.2 Georgia,serif;letter-spacing:3px}
.jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-seal small{font-size:7px;letter-spacing:2px;color:var(--area-edge)}
.jinmu-dialogue-rail[data-theme^='sss-'][data-casting='true'] .jinmu-dialogue-inner{box-shadow:none}
.jinmu-dialogue-rail[data-theme^='sss-'][data-casting='true'] .jinmu-dialogue-name span{color:var(--area-name)}
@media(max-width:760px){
 .jinmu-dialogue-rail[data-theme^='sss-']{padding:0 3px 2px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-frame{border-inline-width:48px;border-image-width:0 48px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-inner{min-height:180px;padding:53px 4px 49px;gap:8px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-face{flex-basis:34px;width:34px;height:42px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name{gap:7px;margin-bottom:3px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name b{font-size:11px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name span{font-size:9px}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-copy p{font-size:13px;line-height:1.5}
 .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-seal{display:none}
}
@media(min-width:761px){
 .coop-battle-portal .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-frame{border-inline-width:48px;border-image-width:0 48px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-inner{min-height:180px;padding:53px 4px 49px;gap:8px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-face{flex-basis:34px;width:34px;height:42px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-name{gap:7px;flex-wrap:wrap}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme^='sss-'] .jinmu-dialogue-copy p{font-size:13px}
}
`;
