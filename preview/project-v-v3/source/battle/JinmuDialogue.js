import {LEONEL_DIALOGUE_CSS} from './LeonelDialogueStyle.js';
import {MERCENARY_DIALOGUE_PROFILES} from './MercenaryDialogueProfiles.js';
import {SHIRANUI_DIALOGUE_CSS} from './ShiranuiDialogueStyle.js';
import {MERCENARY_AREA_DIALOGUE_CSS} from './MercenaryAreaDialogueStyle.js';
export {JINMU_DIALOGUE_LINES} from './MercenaryDialogueProfiles.js';

// Raw content metadata takes precedence over a generic HUNT/PVE background.
// The cooperative battleground reuses RAID rendering but is its own PVE content.
// Actual raids must never create this dialogue or reserve space.
export function jinmuDialogueAllowed(engine){
 const p=engine.battleData||{},b=p.battleV2||{},m=p.monster||{};
 const tokens=[p.mode,p.battlefieldMode,p.battlefield,p.contentType,p.type,b.mode,b.battlefieldMode,b.contentType,b.type,m.mode,m.contentType]
  .map(v=>String(v||'').toUpperCase().replace(/[\s-]+/g,'_')).filter(Boolean);
 if(engine.host?.closest?.('.mr-battle-pane,[data-madara-id],#madara-live-app'))return false;
 const battleground=b.rules?.formation==='COOP_THREE_SQUADS'&&p.sceneAssetKey==='COOP_ARKE_FORGE';
 if(battleground&&!tokens.some(v=>/MADARA|WORLD|LICH|CORE|PVP|RANK|ARENA|SIEGE|TERRITORY|CLAN/.test(v))&&!/PVP|SIEGE/.test(engine.activeBattlefieldMode||''))return true;
 if(engine.formationCoop||engine.coopArkeBattlefield)return false;
 if(tokens.some(v=>/RAID|MADARA|WORLD_BOSS|COOP|PVP|RANK|ARENA|SIEGE|TERRITORY|CLAN/.test(v)))return false;
 if(/RAID|PVP/.test(engine.activeBattlefieldMode||''))return false;
 return tokens.some(v=>/(?:^|_)(?:PVE|HUNT|TOWER|INFINITE|SEAL|ESCORT|DUNGEON|APOCALYPSE|SCRAPYARD|COW|IDLE)(?:_|$)/.test(v));
}

const STYLE_ID='jinmu-dialogue-style-v3';
const CSS=`
.jinmu-dialogue-rail{position:absolute;z-index:13;left:0;right:0;box-sizing:border-box;padding:7px 18px 9px;background:transparent;pointer-events:none;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;line-height:1.4}
.jinmu-dialogue-frame{position:relative;box-sizing:border-box;max-width:1120px;margin:auto;padding:2px;background:linear-gradient(115deg,#79532b,#f5d79a 15%,#a47137 31%,#634326 49%,#dfbc78 73%,#fff0b4 88%,#7b5127);clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% calc(100% - 14px),calc(100% - 14px) 100%,14px 100%,0 calc(100% - 14px),0 14px)}
.jinmu-dialogue-frame:before,.jinmu-dialogue-frame:after{content:'';position:absolute;z-index:2;left:94px;right:126px;height:1px;background:linear-gradient(90deg,#f8d99b,transparent 42%,transparent 58%,#f8d99b)}
.jinmu-dialogue-frame:before{top:6px}.jinmu-dialogue-frame:after{bottom:6px}
.jinmu-dialogue-inner{display:flex;align-items:center;gap:17px;box-sizing:border-box;min-height:86px;padding:9px 18px 9px 13px;background:radial-gradient(ellipse at 5% 0,#57401f66,transparent 55%),linear-gradient(110deg,#171918,#0c121b 65%,#1f1b14);clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 12px),calc(100% - 12px) 100%,12px 100%,0 calc(100% - 12px),0 12px)}
.jinmu-dialogue-face{position:relative;flex:0 0 62px;width:62px;height:62px;padding:3px;box-sizing:border-box;border:1px solid #e8c080;border-radius:50%;background:#1a1c20;box-shadow:0 0 0 3px #574122,0 0 0 4px #a68040}
.jinmu-dialogue-face>i{display:block;width:100%;height:100%;border-radius:50%;background:#1a1c20 url('/preview/mercenary-golden-dragon-battle-v1/assets/source-art-preview.webp') 57% 6% / 390% auto no-repeat;opacity:1}
.jinmu-dialogue-face:after{content:'◆';position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);color:#ffe5a1;text-shadow:0 1px 3px #000;font-size:12px}
.jinmu-dialogue-copy{min-width:0;flex:1}.jinmu-dialogue-name{display:flex;align-items:center;gap:12px;margin-bottom:4px}.jinmu-dialogue-name b{font-size:14px;letter-spacing:.03em;color:#e7c184;font-weight:800}.jinmu-dialogue-name span{color:#8c918f;font-size:10px;letter-spacing:.08em}
.jinmu-dialogue-copy p{margin:0!important;color:#fff1d6;font-size:19px;font-weight:650;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;text-shadow:0 2px 4px #000}
.jinmu-dialogue-lines{display:grid}.jinmu-dialogue-lines>p{grid-area:1/1;min-width:0}.jinmu-dialogue-lines>[aria-hidden='true']{visibility:hidden;pointer-events:none}
.jinmu-dialogue-seal{position:relative;display:grid;place-content:center;gap:1px;flex:0 0 82px;min-height:60px;border-inline:1px solid #a1814260;text-align:center;color:#f3cd84}
.jinmu-dialogue-seal:before{content:'◆ ━ ◆';font-size:8px;color:#ba914b;letter-spacing:2px}.jinmu-dialogue-seal b{font:800 24px/1.1 Georgia,serif;letter-spacing:3px;text-shadow:0 1px #000,0 0 12px #d49a3040}.jinmu-dialogue-seal small{font-size:8px;letter-spacing:2px;color:#c0a575}
.jinmu-dialogue-rail[data-casting='true'] .jinmu-dialogue-name span{color:#f6d28c}.jinmu-dialogue-rail[data-casting='true'] .jinmu-dialogue-inner{box-shadow:inset 0 0 24px #e5ad3826}
.jinmu-dialogue-crest{display:none}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-frame{background:linear-gradient(115deg,#582b39,#ebeff9 15%,#8e93a5 29%,#601f35 50%,#d491a1 73%,#fff2f5 88%,#652a3b)}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-inner{background:radial-gradient(ellipse at 0 0,#7c233e66,transparent 48%),linear-gradient(112deg,#211722,#0f121c 60%,#241420)}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-frame:before,.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-frame:after{background:linear-gradient(90deg,#d8deed,transparent 42%,transparent 58%,#cb8397)}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-face{border-color:#e3d7e0;box-shadow:0 0 0 3px #532337,0 0 0 4px #b67a8a}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-face:after{color:#ff637d}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-name b{color:#f2bbc9}.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-copy p{color:#fff1f5}
.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-seal{color:#e7ddeb;border-color:#d798ad60}.jinmu-dialogue-rail[data-theme='valter'] .jinmu-dialogue-seal small{color:#bba3b5}
.jinmu-dialogue-rail[data-theme='valter'][data-casting='true'] .jinmu-dialogue-name span{color:#ffabbc}.jinmu-dialogue-rail[data-theme='valter'][data-casting='true'] .jinmu-dialogue-inner{box-shadow:inset 0 0 26px #ff37652a}
.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-frame{background:linear-gradient(115deg,#966626,#ffefbc 15%,#d8aa55 31%,#a06a25 49%,#eac67b 73%,#fffbe6 88%,#ae7936)}
.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-inner{background:radial-gradient(ellipse at 0 0,#b17a2260,transparent 48%),linear-gradient(112deg,#292219,#10141d 62%,#30271c)}
.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-face{border-color:#fff2c8;box-shadow:0 0 0 3px #66491f,0 0 0 4px #e7c77d}
.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-face:after{content:'✦';color:#fff2bd}
.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-name b{color:#ffdfa0}.jinmu-dialogue-rail[data-theme='helios'] .jinmu-dialogue-copy p{color:#fffae8}
.jinmu-dialogue-rail[data-theme='helios'][data-casting='true'] .jinmu-dialogue-inner{box-shadow:inset 0 0 28px #ffd26130}
.jinmu-dialogue-rail:not([data-theme='jinmu']) .jinmu-dialogue-seal:before{display:none}
.jinmu-dialogue-rail:not([data-theme='jinmu']) .jinmu-dialogue-crest{display:block;width:27px;height:23px;margin:0 auto 3px;color:inherit;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.jinmu-dialogue-rail:not([data-theme='jinmu']) .jinmu-dialogue-seal b{font-size:20px}
.jinmu-dialogue-rail[data-theme='valter'] [data-crest='sun'],.jinmu-dialogue-rail[data-theme='helios'] [data-crest='swords']{display:none}
.jinmu-dialogue-rail[data-theme='jokro']{padding:4px 12px 6px;background:transparent}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-frame{max-width:1060px;border:0 solid transparent;border-inline-width:72px;border-image:url('/assets/ui/project-v/mercenaries/jokro-dialogue-20261018/frame.webp') 0 480 fill /0 72px stretch;background:none;clip-path:none;padding:0}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-frame:before,.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-frame:after,.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-crest{display:none}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-inner{background:none;clip-path:none;min-height:110px;padding:24px 3px;gap:16px;box-shadow:none}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-copy{text-align:left}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-name b{color:#b9ead1;font-size:13px;letter-spacing:.12em}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-name span{color:#79a995;font-size:10px;letter-spacing:.1em}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-copy p{color:#e5f4ec;font-size:17px;font-weight:500;line-height:1.55;text-shadow:0 1px 3px #000}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-face{flex-basis:52px;width:52px;height:52px;padding:0;border:0;background:none;box-shadow:none}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-face:after{display:none}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-seal{border:0;color:#a7cfb7;flex-basis:64px;min-height:0}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-seal b{font-size:18px;font-weight:500;letter-spacing:4px;text-shadow:none}
.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-seal small{font-size:7px;color:#799788}
.jinmu-dialogue-rail[data-theme='jokro'][data-casting='true'] .jinmu-dialogue-inner{box-shadow:none}
.jinmu-dialogue-rail[data-theme='jokro'][data-casting='true'] .jinmu-dialogue-name span{color:#b8ffda}
.battle-v3-live-shell.is-result-visible .jinmu-dialogue-rail{visibility:hidden}
.battle-v3-live-shell.has-jinmu-dialogue .nightmare-battle-mark{translate:0 var(--jinmu-dialogue-height,0px)}
body[data-jinmu-dialogue='true'][data-legion-live] .boss-hud,body[data-jinmu-dialogue='true'][data-legion-live] #hunt-pickup-toast{translate:0 var(--jinmu-dialogue-height,0px)}
.coop-battle-portal.has-jinmu-dialogue>.coop-pattern{top:calc(var(--jinmu-dialogue-bottom,140px) + 8px)}
.coop-battle-portal .jinmu-dialogue-rail{background:transparent}
@media(max-width:760px){.jinmu-dialogue-rail{padding:5px 7px 7px}.jinmu-dialogue-inner{min-height:90px;padding:9px 12px;gap:11px}.jinmu-dialogue-face{flex-basis:48px;width:48px;height:48px;padding:2px}.jinmu-dialogue-name{gap:7px;margin-bottom:3px;flex-wrap:wrap}.jinmu-dialogue-name b{font-size:12px}.jinmu-dialogue-name span{font-size:9px}.jinmu-dialogue-copy p{font-size:14px;line-height:1.65}.jinmu-dialogue-seal{display:none}.jinmu-dialogue-frame:before,.jinmu-dialogue-frame:after{left:78px;right:20px}}
@media(max-width:760px){.coop-battle-portal.has-jinmu-dialogue>.coop-pattern{top:auto}}
@media(max-height:620px) and (orientation:landscape){.jinmu-dialogue-rail{padding-block:4px}.jinmu-dialogue-inner{min-height:62px;padding-block:5px}.jinmu-dialogue-face{flex-basis:44px;width:44px;height:44px}.jinmu-dialogue-copy p{font-size:14px}.jinmu-dialogue-name b{font-size:11px}.jinmu-dialogue-seal{min-height:45px}.jinmu-dialogue-seal b{font-size:18px}}
@media(max-width:760px){.jinmu-dialogue-rail[data-theme='jokro']{padding:2px 5px 4px}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-frame{border-inline-width:44px;border-image-width:0 44px}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-inner{min-height:112px;padding:25px 0;gap:9px}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-face{flex-basis:38px;width:38px;height:38px}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-copy p{font-size:13px;line-height:1.6}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-name{gap:7px;flex-wrap:nowrap}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-name b{font-size:12px}.jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-name span{font-size:9px}}
`;

const DIALOGUE_CSS=CSS+SHIRANUI_DIALOGUE_CSS+LEONEL_DIALOGUE_CSS+MERCENARY_AREA_DIALOGUE_CSS+`
@media(min-width:761px){
 .coop-battle-portal .jinmu-dialogue-rail{left:auto;right:8px;width:32%;max-width:620px;padding:6px 0}
 .coop-battle-portal .jinmu-dialogue-seal{display:none}
 .coop-battle-portal .jinmu-dialogue-inner{gap:9px}
 .coop-battle-portal .jinmu-dialogue-rail .jinmu-dialogue-copy p{font-size:14px}
 .coop-battle-portal .jinmu-dialogue-name{gap:7px;flex-wrap:wrap}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-frame{border-inline-width:44px;border-image-width:0 44px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-inner{padding:24px 0;gap:9px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='jokro'] .jinmu-dialogue-face{flex-basis:38px;width:38px;height:38px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-frame:before{border-inline-width:92px;border-image-width:0 92px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-inner{padding:49px 52px 49px 108px}
 .coop-battle-portal .jinmu-dialogue-rail[data-theme='shiranui'] .jinmu-dialogue-face{left:31px;width:43px;height:43px}
}
`;
const rails=new WeakMap();

// One dialogue per engine; cooperative dialogue overlays the battlefield.
// Each actor keeps its own lines and cast index; only the current speaker draws.
class DialogueRail{
 constructor(engine,shell){
  this.engine=engine;this.members=new Set();
  this.shell=shell;this.host=engine.host;this.header=shell.querySelector('.battle-v3-header');
  this.portal=shell.closest('.coop-battle-portal');
  this.coopHeaders=this.portal?[...this.portal.querySelectorAll(':scope>.coop-battle-top,:scope>.coop-boss-hud')]:[];
  const document=shell.ownerDocument;
  let style=document.getElementById(STYLE_ID);
  if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.append(style);}
  if(style.textContent!==DIALOGUE_CSS)style.textContent=DIALOGUE_CSS;
  this.node=document.createElement('section');this.node.className='jinmu-dialogue-rail';
  this.node.innerHTML='<div class="jinmu-dialogue-frame"><div class="jinmu-dialogue-inner"><div class="jinmu-dialogue-face" role="img"><i></i></div><div class="jinmu-dialogue-copy"><div class="jinmu-dialogue-name"><b></b><span></span></div><div class="jinmu-dialogue-lines"><p role="status" aria-live="polite" aria-atomic="true"></p></div></div><div class="jinmu-dialogue-seal" aria-label="SSS 리미티드"><svg class="jinmu-dialogue-crest" viewBox="0 0 32 28" aria-hidden="true"><g data-crest="swords"><path d="m7 3 15 17-4-1-13-13 2-3Zm18 0L10 20l4-1L27 6l-2-3ZM7 17l7 7m-10 0 5-5m16-2-7 7m10 0-5-5"/><path d="m16 2 3 4-3 4-3-4Z"/></g><g data-crest="sun"><circle cx="16" cy="14" r="7"/><circle cx="16" cy="14" r="4"/><path d="M16 1v4m0 18v4M3 14h4m18 0h4M7 5l3 3m12 12 3 3M7 23l3-3M22 8l3-3"/></g></svg><b>SSS</b><small>LIMITED</small></div></div></div>';
  this.line=this.node.querySelector('p');this.lines=this.node.querySelector('.jinmu-dialogue-lines');
  shell.append(this.node);shell.classList.add('has-jinmu-dialogue');
  this.portal?.classList.add('has-jinmu-dialogue');
  this.body=document.body;
  if(this.body.hasAttribute('data-legion-live'))this.body.dataset.jinmuDialogue='true';
  this.layout=()=>{
   if(this.destroyed||!this.node.isConnected)return;
   const width=this.node.getBoundingClientRect().width;
   if(this.measuredWidth!==width&&[...this.members].some(m=>['jokro','shiranui','leonel'].includes(m.profile.theme)||m.profile.theme.startsWith('sss-'))){
    // A mixed squad shares this row. Reserve the tallest theme before any
    // speaker casts, so switching to the new frame cannot resize the board.
    const theme=this.node.dataset.theme;let height=0;this.node.style.minHeight='';
    for(const member of this.members){this.node.dataset.theme=member.profile.theme;height=Math.max(height,this.node.getBoundingClientRect().height);}
    this.node.dataset.theme=theme;this.node.style.minHeight=Math.ceil(height)+'px';this.measuredWidth=width;
   }
   const shellTop=shell.getBoundingClientRect().top;
   const header=Math.max(this.header?.getBoundingClientRect().height||0,...this.coopHeaders.map(el=>Math.max(0,el.getBoundingClientRect().bottom-shellTop))),height=this.node.getBoundingClientRect().height;
   this.node.style.top=header+'px';shell.style.setProperty('--jinmu-dialogue-height',height+'px');
   if(this.body.dataset.jinmuDialogue==='true')this.body.style.setProperty('--jinmu-dialogue-height',height+'px');
   this.portal?.style.setProperty('--jinmu-dialogue-bottom',(header+height)+'px');
   const top=this.portal?header+height:Math.max(0,this.node.getBoundingClientRect().bottom-this.host.getBoundingClientRect().top);
   // Pixi owns the resize callback. Calling engine.resize during actor loading
   // is too early: its status UI is constructed after the mercenary assets.
   if(top!==this.top){
    this.top=top;
    if(!this.portal)engine.dialogueTopInset=top;
    if(engine.uiLayer?.statusPanel)engine.resize();
   }
  };
  this.layout();this.observer=new ResizeObserver(this.layout);this.observer.observe(this.node);if(this.header)this.observer.observe(this.header);
  for(const header of this.coopHeaders)this.observer.observe(header);
 }
 add(member){
  this.members.add(member);
  this.measuredWidth=null;
  // Measure every possible line before casting, so changing speaker or text
  // never changes the canvas height mid-attack, especially on mobile.
  for(const text of member.profile.lines){const p=this.node.ownerDocument.createElement('p');p.setAttribute('aria-hidden','true');p.textContent='“'+text+'”';this.lines.append(p);}
  if(!this.current||member.profile.theme==='jinmu'&&!this.current.active)this.show(member);
  this.layout();
 }
 show(member){
  this.current=member;const p=member.profile;
  this.node.dataset.theme=p.theme;this.node.dataset.speaker=p.code;this.node.dataset.casting=String(member.active);
  this.node.setAttribute('aria-label',p.name+' 대사');
  this.node.querySelector('.jinmu-dialogue-name b').textContent=p.name;
  this.node.querySelector('.jinmu-dialogue-name span').textContent=member.skillLabel||p.skill;
  const face=this.node.querySelector('.jinmu-dialogue-face');face.setAttribute('aria-label',p.name+' 얼굴 초상');
  const image=face.querySelector('i');image.style.backgroundImage=`url("${p.portrait}")`;image.style.backgroundPosition=p.position;image.style.backgroundSize=p.size;
  this.line.textContent=member.lastLine;
 }
 remove(member){
  this.members.delete(member);
  if(!this.members.size){this.destroy();return;}
  if(this.current===member)this.show([...this.members].find(m=>m.active)||this.members.values().next().value);
 }
 destroy(){
  if(this.destroyed)return;this.destroyed=true;this.observer?.disconnect();this.node?.remove();
  rails.delete(this.engine);
  this.shell.classList.remove('has-jinmu-dialogue');this.shell.style.removeProperty('--jinmu-dialogue-height');
  this.portal?.classList.remove('has-jinmu-dialogue');this.portal?.style.removeProperty('--jinmu-dialogue-bottom');
  delete this.engine.dialogueTopInset;
  if(this.body.dataset.jinmuDialogue==='true'){delete this.body.dataset.jinmuDialogue;this.body.style.removeProperty('--jinmu-dialogue-height');}
  if(!this.engine.disposed&&this.engine.uiLayer?.statusPanel)this.engine.resize();
 }
}

export class JinmuDialogue{
 constructor(engine,profile=MERCENARY_DIALOGUE_PROFILES['V-989']){
  this.engine=engine;this.profile=profile;this.castIndex=0;this.active=false;this.lastLine=profile.idleLine;
  const shell=engine.host?.closest?.('.battle-v3-live-shell');
  if(!shell||!jinmuDialogueAllowed(engine))return;
  this.rail=rails.get(engine);
  if(!this.rail){this.rail=new DialogueRail(engine,shell);rails.set(engine,this.rail);}
  this.rail.add(this);
 }
 get node(){return this.rail?.node;}
 get line(){return this.rail?.line;}
 begin(line=null,skill=null){
  if(!this.node||this.destroyed)return;
  if(!jinmuDialogueAllowed(this.engine)){this.destroy();return;}
  this.active=true;this.skillLabel=skill||this.profile.skill;this.lastLine='“'+(line||this.profile.lines[this.castIndex%this.profile.lines.length])+'”';this.castIndex++;this.rail.show(this);
 }
 end(){this.active=false;if(this.rail?.current===this)this.node.dataset.casting='false';}
 diagnostics(){return {visible:!!this.node?.isConnected&&!this.destroyed&&this.rail.current===this,line:this.lastLine,castIndex:this.castIndex,active:this.active,fullIllustration:false,speaker:this.rail?.current?.profile.code};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.active=false;this.rail?.remove(this);}
}
