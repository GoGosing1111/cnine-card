export const JINMU_DIALOGUE_LINES=Object.freeze([
 '고개를 들어라. 마지막으로 볼 하늘이다.',
 '천룡의 이름으로, 이 전장을 평정한다.',
 '내 검 앞에서 운명을 논하지 마라.',
 '용이 눈을 떴다. 이제 물러설 곳은 없다.',
 '천룡이여, 내려와 오만한 자들을 심판하라.'
]);

// Raw content metadata takes precedence over a generic HUNT/PVE background.
// Madara and every other raid must never create this dialogue or reserve space.
export function jinmuDialogueAllowed(engine){
 const p=engine.battleData||{},b=p.battleV2||{},m=p.monster||{};
 const tokens=[p.mode,p.battlefieldMode,p.battlefield,p.contentType,p.type,b.mode,b.battlefieldMode,b.contentType,b.type,m.mode,m.contentType]
  .map(v=>String(v||'').toUpperCase().replace(/[\s-]+/g,'_')).filter(Boolean);
 if(engine.formationCoop||engine.coopArkeBattlefield||engine.host?.closest?.('.mr-battle-pane,[data-madara-id],#madara-live-app'))return false;
 if(tokens.some(v=>/RAID|MADARA|WORLD_BOSS|COOP|PVP|RANK|ARENA|SIEGE|TERRITORY|CLAN/.test(v)))return false;
 if(/RAID|PVP/.test(engine.activeBattlefieldMode||''))return false;
 return tokens.some(v=>/(?:^|_)(?:PVE|HUNT|TOWER|INFINITE|SEAL|ESCORT|DUNGEON|APOCALYPSE|SCRAPYARD|COW|IDLE)(?:_|$)/.test(v));
}

const STYLE_ID='jinmu-dialogue-style-v3';
const CSS=`
.jinmu-dialogue-rail{position:absolute;z-index:13;left:0;right:0;box-sizing:border-box;padding:7px 18px 9px;background:#090d13;pointer-events:none;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;line-height:1.4}
.jinmu-dialogue-frame{position:relative;box-sizing:border-box;max-width:1120px;margin:auto;padding:2px;background:linear-gradient(115deg,#79532b,#f5d79a 15%,#a47137 31%,#634326 49%,#dfbc78 73%,#fff0b4 88%,#7b5127);clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px)}
.jinmu-dialogue-frame:before,.jinmu-dialogue-frame:after{content:'';position:absolute;z-index:2;left:94px;right:126px;height:1px;background:linear-gradient(90deg,#f8d99b,transparent 42%,transparent 58%,#f8d99b)}
.jinmu-dialogue-frame:before{top:6px}.jinmu-dialogue-frame:after{bottom:6px}
.jinmu-dialogue-inner{display:flex;align-items:center;gap:17px;box-sizing:border-box;min-height:86px;padding:9px 18px 9px 13px;background:radial-gradient(ellipse at 5% 0,#57401f66,transparent 55%),linear-gradient(110deg,#171918,#0c121b 65%,#1f1b14);clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px)}
.jinmu-dialogue-face{position:relative;flex:0 0 62px;width:62px;height:62px;padding:3px;box-sizing:border-box;border:1px solid #e8c080;border-radius:50%;background:#1a1c20;box-shadow:0 0 0 3px #574122,0 0 0 4px #a68040}
.jinmu-dialogue-face>i{display:block;width:100%;height:100%;border-radius:50%;background:#1a1c20 url('/preview/mercenary-golden-dragon-battle-v1/assets/source-art-preview.webp') 57% 6% / 390% auto no-repeat;opacity:1}
.jinmu-dialogue-face:after{content:'◆';position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);color:#ffe5a1;text-shadow:0 1px 3px #000;font-size:12px}
.jinmu-dialogue-copy{min-width:0;flex:1}.jinmu-dialogue-name{display:flex;align-items:center;gap:12px;margin-bottom:4px}.jinmu-dialogue-name b{font-size:14px;letter-spacing:.03em;color:#e7c184;font-weight:800}.jinmu-dialogue-name span{color:#8c918f;font-size:10px;letter-spacing:.08em}
.jinmu-dialogue-copy p{margin:0!important;color:#fff1d6;font-size:19px;font-weight:650;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;text-shadow:0 2px 4px #000}
.jinmu-dialogue-seal{position:relative;display:grid;place-content:center;gap:1px;flex:0 0 82px;min-height:60px;border-inline:1px solid #a1814260;text-align:center;color:#f3cd84}
.jinmu-dialogue-seal:before{content:'◆ ━ ◆';font-size:8px;color:#ba914b;letter-spacing:2px}.jinmu-dialogue-seal b{font:800 24px/1.1 Georgia,serif;letter-spacing:3px;text-shadow:0 1px #000,0 0 12px #d49a3040}.jinmu-dialogue-seal small{font-size:8px;letter-spacing:2px;color:#c0a575}
.jinmu-dialogue-rail[data-casting='true'] .jinmu-dialogue-name span{color:#f6d28c}.jinmu-dialogue-rail[data-casting='true'] .jinmu-dialogue-inner{box-shadow:inset 0 0 24px #e5ad3826}
.battle-v3-live-shell.is-result-visible .jinmu-dialogue-rail{visibility:hidden}
.battle-v3-live-shell.has-jinmu-dialogue .nightmare-battle-mark{translate:0 var(--jinmu-dialogue-height,0px)}
body[data-jinmu-dialogue='true'][data-legion-live] .boss-hud,body[data-jinmu-dialogue='true'][data-legion-live] #hunt-pickup-toast{translate:0 var(--jinmu-dialogue-height,0px)}
@media(max-width:760px){.jinmu-dialogue-rail{padding:5px 7px 7px}.jinmu-dialogue-inner{min-height:90px;padding:9px 12px;gap:11px}.jinmu-dialogue-face{flex-basis:48px;width:48px;height:48px;padding:2px}.jinmu-dialogue-name{gap:7px;margin-bottom:3px;flex-wrap:wrap}.jinmu-dialogue-name b{font-size:12px}.jinmu-dialogue-name span{font-size:9px}.jinmu-dialogue-copy p{font-size:14px;line-height:1.65}.jinmu-dialogue-seal{display:none}.jinmu-dialogue-frame:before,.jinmu-dialogue-frame:after{left:78px;right:20px}}
@media(max-height:620px) and (orientation:landscape){.jinmu-dialogue-rail{padding-block:4px}.jinmu-dialogue-inner{min-height:62px;padding-block:5px}.jinmu-dialogue-face{flex-basis:44px;width:44px;height:44px}.jinmu-dialogue-copy p{font-size:14px}.jinmu-dialogue-name b{font-size:11px}.jinmu-dialogue-seal{min-height:45px}.jinmu-dialogue-seal b{font-size:18px}}
`;

export class JinmuDialogue{
 constructor(engine){
  this.engine=engine;this.castIndex=0;this.active=false;
  const shell=engine.host?.closest?.('.battle-v3-live-shell');
  if(!shell||!jinmuDialogueAllowed(engine))return;
  this.shell=shell;this.host=engine.host;this.header=shell.querySelector('.battle-v3-header');
  const document=shell.ownerDocument;
  if(!document.getElementById(STYLE_ID)){const style=document.createElement('style');style.id=STYLE_ID;style.textContent=CSS;document.head.append(style);}
  this.node=document.createElement('section');this.node.className='jinmu-dialogue-rail';this.node.setAttribute('aria-label','천룡검황 진무 대사');
  this.node.innerHTML='<div class="jinmu-dialogue-frame"><div class="jinmu-dialogue-inner"><div class="jinmu-dialogue-face" role="img" aria-label="진무 얼굴 초상"><i></i></div><div class="jinmu-dialogue-copy"><div class="jinmu-dialogue-name"><b>천룡검황 진무</b><span>천룡강림</span></div><p role="status" aria-live="polite" aria-atomic="true"></p></div><div class="jinmu-dialogue-seal" aria-label="SSS 리미티드"><b>SSS</b><small>LIMITED</small></div></div></div>';
  this.line=this.node.querySelector('p');this.line.textContent='천룡의 이름으로, 이 전장을 평정한다.';
  this.previousTop={value:this.host.style.getPropertyValue('top'),priority:this.host.style.getPropertyPriority('top')};
  shell.append(this.node);shell.classList.add('has-jinmu-dialogue');
  this.body=document.body;
  if(this.body.hasAttribute('data-legion-live'))this.body.dataset.jinmuDialogue='true';
  this.layout=()=>{
   if(this.destroyed||!this.node.isConnected)return;
   const header=this.header?.getBoundingClientRect().height||0,height=this.node.getBoundingClientRect().height;
   this.node.style.top=header+'px';shell.style.setProperty('--jinmu-dialogue-height',height+'px');
   if(this.body.dataset.jinmuDialogue==='true')this.body.style.setProperty('--jinmu-dialogue-height',height+'px');
   const top=header+height;
   // Pixi owns the resize callback. Calling engine.resize during actor loading
   // is too early: its status UI is constructed after the mercenary assets.
   if(top!==this.top){this.top=top;this.host.style.setProperty('top',top+'px','important');engine.app?.resize?.();}
  };
  this.layout();this.observer=new ResizeObserver(this.layout);this.observer.observe(this.node);if(this.header)this.observer.observe(this.header);
 }
 begin(){
  if(!this.node||this.destroyed)return;
  if(!jinmuDialogueAllowed(this.engine)){this.destroy();return;}
  this.active=true;this.node.dataset.casting='true';
  this.line.textContent='“'+JINMU_DIALOGUE_LINES[this.castIndex++%JINMU_DIALOGUE_LINES.length]+'”';
 }
 end(){this.active=false;if(this.node)this.node.dataset.casting='false';}
 diagnostics(){return {visible:!!this.node?.isConnected&&!this.destroyed,line:this.line?.textContent||'',castIndex:this.castIndex,active:this.active,fullIllustration:false};}
 destroy(){
  if(this.destroyed)return;this.destroyed=true;this.observer?.disconnect();this.node?.remove();
  if(!this.shell)return;
  this.shell.classList.remove('has-jinmu-dialogue');this.shell.style.removeProperty('--jinmu-dialogue-height');
  this.host.style.setProperty('top',this.previousTop.value,this.previousTop.priority);
  if(this.body.dataset.jinmuDialogue==='true'){delete this.body.dataset.jinmuDialogue;this.body.style.removeProperty('--jinmu-dialogue-height');}
  if(!this.engine.disposed)this.engine.app?.resize?.();
 }
}
