// ImageGen supplies the frame; all labels remain accessible DOM text.
export const SHIRANUI_DIALOGUE_CSS=`
.jinmu-dialogue-rail[data-theme='shiranui']{padding:2px 10px 4px}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-frame{max-width:1080px;background:none;clip-path:none;padding:0}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-frame:before{display:block;inset:0;height:auto;border:0 solid transparent;border-inline-width:110px;border-image:url('/assets/ui/project-v/mercenaries/shiranui-fx-20261018/dialogue.webp') 0 550 fill /0 110px stretch;background:none;z-index:0}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-frame:after,.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-crest,.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-face:after{display:none}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-inner{position:relative;z-index:1;min-height:144px;padding:40px 115px 40px 128px;gap:0;background:none;clip-path:none;box-shadow:none}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-face{position:absolute;left:38px;top:50%;transform:translateY(-50%);width:50px;height:50px;padding:0;border:0;background:none;box-shadow:none}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-face>i{border-radius:50%}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name b{color:#edf1f5;font-size:13px;letter-spacing:.12em}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name span{color:#b7c0cc;font-size:10px}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-copy{text-align:left;transform:translateY(-5px)}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-copy p{color:#f5f7fa;font-size:17px;line-height:1.5;font-weight:500}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-seal{position:absolute;right:28px;top:50%;transform:translateY(-50%);width:65px;min-height:0;border:0;color:#fff;text-shadow:0 2px 5px #000}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-seal b{font-size:19px;letter-spacing:4px}
.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-seal small{color:#cfd4dc;font-size:7px}
.jinmu-dialogue-rail[data-theme='shiranui'][data-casting='true'] .jinmu-dialogue-inner{box-shadow:none}
.jinmu-dialogue-rail[data-theme='shiranui'][data-casting='true'] .jinmu-dialogue-name span{color:#fff}
@media(max-width:760px){
 .jinmu-dialogue-rail[data-theme='shiranui']{padding:0 4px 2px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-frame:before{border-inline-width:92px;border-image-width:0 92px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-inner{min-height:174px;padding:49px 52px 49px 108px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-face{left:31px;width:43px;height:43px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name{gap:5px;flex-wrap:wrap}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name b{font-size:12px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name span{font-size:9px}
 .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-copy p{font-size:13px;line-height:1.55}
}
@media(max-width:360px){.jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-name span{display:none}}
`;
