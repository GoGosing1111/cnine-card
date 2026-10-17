export const JOKRO_LINES=Object.freeze([
 '칼끝이 닿기 전에, 승부는 끝났다.',
 '흐름을 읽어라. 베이는 것은 한순간이다.',
 '청룡이 지나간 자리엔 고요만 남는다.',
 '검을 뽑는 순간, 물러설 길은 없다.',
 '이 한 칼로, 하늘마저 가른다.'
]);
const ROOT='/preview/mercenary-jokro-iaido-20261017-v1/';
const CSS=`
.jokro-dialogue-rail{position:absolute;z-index:13;left:0;right:0;box-sizing:border-box;padding:7px 18px 9px;background:#090f10;pointer-events:none;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;line-height:1.4}
.jokro-dialogue-frame{box-sizing:border-box;max-width:1120px;margin:auto;border:12px solid transparent;border-image:url('${ROOT}assets/ui/frame.webp') 270 fill /12px stretch;background:#08140f;background-clip:padding-box}
.jokro-dialogue-inner{display:flex;align-items:center;gap:17px;min-height:62px;padding:0 8px;box-sizing:border-box}
.jokro-dialogue-face{flex:0 0 62px;width:62px;height:62px;box-sizing:border-box;border:5px solid transparent;border-image:url('${ROOT}assets/ui/frame.webp') 270 fill /5px stretch}
.jokro-dialogue-face>i{display:block;width:100%;height:100%;background:#13211b url('${ROOT}assets/source-art-preview.webp') 50% 14% /500% auto no-repeat;opacity:1}
.jokro-dialogue-copy{min-width:0;flex:1}.jokro-dialogue-name{display:flex;align-items:center;gap:12px;margin-bottom:4px}.jokro-dialogue-name b{font-size:14px;color:#9af3c5;font-weight:800;letter-spacing:.03em}.jokro-dialogue-name span{font-size:10px;color:#87a899;letter-spacing:.08em}
.jokro-dialogue-lines{display:grid}.jokro-dialogue-lines>p{grid-area:1/1;min-width:0;margin:0!important;font-size:19px;line-height:1.55;font-weight:650;color:#e9fff3;word-break:keep-all;overflow-wrap:anywhere;text-align:center;text-shadow:0 2px 4px #000}.jokro-dialogue-lines>[aria-hidden='true']{visibility:hidden;pointer-events:none}
.jokro-dialogue-seal{display:grid;place-content:center;text-align:center;flex:0 0 82px;min-height:60px;color:#b2ffda;background:url('${ROOT}assets/ui/button.webp') center/100% 100% no-repeat}.jokro-dialogue-seal b{font:800 24px/1.1 Georgia,serif;letter-spacing:3px}.jokro-dialogue-seal small{font-size:8px;letter-spacing:2px;color:#92bea6;margin-top:3px}
.jokro-dialogue-rail[data-casting='true'] .jokro-dialogue-name span{color:#bdffe0}.battle-v3-live-shell.is-result-visible .jokro-dialogue-rail{visibility:hidden}
.battle-v3-live-shell.has-jokro-dialogue .battle-v3-status{translate:0 var(--jokro-dialogue-height,0px)}
@media(max-width:760px){.jokro-dialogue-rail{padding:5px 7px 7px}.jokro-dialogue-frame{border-width:10px;border-image-width:10px}.jokro-dialogue-inner{min-height:70px;padding:0 3px;gap:11px}.jokro-dialogue-face{flex-basis:48px;width:48px;height:48px;border-width:4px;border-image-width:4px}.jokro-dialogue-name{gap:7px;flex-wrap:wrap;margin-bottom:3px}.jokro-dialogue-name b{font-size:12px}.jokro-dialogue-name span{font-size:9px}.jokro-dialogue-lines>p{font-size:14px;line-height:1.65}.jokro-dialogue-seal{display:none}}
.jokro-dialogue-rail[data-compact='true']{padding-block:4px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-inner{min-height:44px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-face{flex-basis:44px;width:44px;height:44px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-lines>p{font-size:14px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-name b{font-size:11px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-seal{min-height:44px}.jokro-dialogue-rail[data-compact='true'] .jokro-dialogue-seal b{font-size:18px}
`;

// Same placement/lifecycle as JinmuDialogue: reserve a row below the battle
// header, measure all possible lines, retain the last line, restore host on exit.
// This isolated art preview does not change the production PVE/raid/PVP gates.
export class JokroDialogue {
 constructor(engine){
  this.engine=engine;this.index=-1;this.active=false;this.shell=engine.host.closest('.battle-v3-live-shell');this.host=engine.host;
  const doc=this.shell.ownerDocument;this.header=this.shell.querySelector('.battle-v3-header');
  this.style=doc.createElement('style');this.style.textContent=CSS;doc.head.append(this.style);
  this.root=doc.createElement('section');this.root.id='limited-dialogue';this.root.className='jokro-dialogue-rail';this.root.dataset.casting='false';this.root.setAttribute('aria-label','족로 SSS 리미티드 대사');
  this.root.innerHTML='<div class="jokro-dialogue-frame"><div class="jokro-dialogue-inner"><div class="jokro-dialogue-face" role="img" aria-label="족로 얼굴 초상"><i></i></div><div class="jokro-dialogue-copy"><div class="jokro-dialogue-name"><b>족로</b><span id="limited-skill">청룡의 발도</span></div><div class="jokro-dialogue-lines"><p id="limited-quote" role="status" aria-live="polite" aria-atomic="true"></p></div></div><div class="jokro-dialogue-seal" aria-label="SSS 리미티드"><b>SSS</b><small>LIMITED</small></div></div></div>';
  this.quote=this.root.querySelector('#limited-quote');this.skill=this.root.querySelector('#limited-skill');this.quote.textContent='“'+JOKRO_LINES[0]+'”';
  for(const text of JOKRO_LINES){const p=doc.createElement('p');p.setAttribute('aria-hidden','true');p.textContent='“'+text+'”';this.root.querySelector('.jokro-dialogue-lines').append(p);}
  this.previousTop={value:this.host.style.getPropertyValue('top'),priority:this.host.style.getPropertyPriority('top')};
  this.shell.append(this.root);this.shell.classList.add('has-jokro-dialogue');
  this.layout=()=>{
   if(this.destroyed||!this.root.isConnected)return;
   const viewport=doc.defaultView.parent;this.root.dataset.compact=String(viewport.innerHeight<=620&&viewport.innerWidth>viewport.innerHeight);
   const header=this.header.getBoundingClientRect().height,height=this.root.getBoundingClientRect().height,top=header+height;
   this.root.style.top=header+'px';this.shell.style.setProperty('--jokro-dialogue-height',height+'px');
   if(this.top!==top){this.top=top;this.host.style.setProperty('top',top+'px','important');engine.app.resize();doc.dispatchEvent(new Event('v3-formation-resize'));}
  };
  this.layout();this.observer=new ResizeObserver(this.layout);this.observer.observe(this.root);this.observer.observe(this.header);
 }
 begin(mode,label){
  if(!['skill','ultimate','awakening'].includes(mode))return;
  this.index=(this.index+1)%JOKRO_LINES.length;this.quote.textContent='“'+JOKRO_LINES[this.index]+'”';this.skill.textContent=label;this.root.dataset.casting='true';this.active=true;
 }
 end(){this.active=false;this.root.dataset.casting='false';}
 diagnostics(){return {visible:!!this.root.isConnected&&!this.destroyed,text:this.quote.textContent,index:this.index,active:this.active,portrait:true,portraitSource:ROOT+'assets/source-art-preview.webp',placement:'BELOW_BATTLE_HEADER_ABOVE_CANVAS',fullIllustration:false,measuredLines:this.root.querySelectorAll('[aria-hidden=true]').length};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.end();this.observer.disconnect();this.root.remove();this.style.remove();this.shell.classList.remove('has-jokro-dialogue');this.shell.style.removeProperty('--jokro-dialogue-height');this.host.style.setProperty('top',this.previousTop.value,this.previousTop.priority);}
}
