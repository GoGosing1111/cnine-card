import {LINES,MODES} from '../motion.mjs';
const ROOT='/preview/mercenary-leonel-sss-limited-20261018-v1/';
const CSS=`
.leonel-dialogue{position:absolute;z-index:13;left:0;right:0;padding:2px 12px 4px;pointer-events:none;box-sizing:border-box;background:#0b0e13;font-family:'Malgun Gothic',sans-serif}
.leonel-dialogue-inner{position:relative;box-sizing:border-box;display:flex;align-items:center;gap:18px;max-width:1120px;min-height:110px;margin:auto;padding:22px 10px;border:0 solid transparent;border-inline-width:90px;border-image:url('${ROOT}assets/ui/dialogue-frame.png') 0 350 fill /0 90px stretch}
.leonel-portrait{width:58px;height:58px;flex:0 0 58px;object-fit:cover;object-position:50% 16%;clip-path:polygon(10% 0,90% 0,100% 10%,100% 90%,90% 100%,10% 100%,0 90%,0 10%)}
.leonel-portrait-wrap{width:58px;height:58px;flex:0 0 58px;background-position:71% 14%;background-size:450% auto;background-repeat:no-repeat}
.leonel-dialogue-copy{flex:1;min-width:0}.leonel-dialogue-name{display:flex;gap:12px;align-items:center;margin-bottom:4px}.leonel-dialogue-name b{font-size:13px;color:#e7d6ab;letter-spacing:.08em}.leonel-dialogue-name span{font-size:10px;color:#a5b2c1;letter-spacing:.05em}.leonel-dialogue-lines{display:grid}.leonel-dialogue-lines p{grid-area:1/1;margin:0!important;font-size:17px;line-height:1.6;color:#f2f3ed;font-weight:500;word-break:keep-all;text-shadow:0 1px 3px #000}.leonel-dialogue-lines [aria-hidden=true]{visibility:hidden}.leonel-dialogue-seal{font:18px Georgia,serif;letter-spacing:3px;color:#e9d8ae;text-align:center;min-width:68px}.leonel-dialogue-seal small{display:block;font:7px sans-serif;letter-spacing:2px;color:#9fabb6;margin-top:5px}
@media(max-width:760px){.battle-v3-header{padding-right:18px!important}.leonel-dialogue{padding:2px 10px 4px}.leonel-dialogue-inner{padding:19px 0;gap:10px;min-height:110px;border-inline-width:44px;border-image-width:0 44px}.leonel-portrait-wrap{width:42px;height:42px;flex-basis:42px}.leonel-dialogue-name{gap:8px}.leonel-dialogue-name b{font-size:12px}.leonel-dialogue-name span{font-size:9px}.leonel-dialogue-lines p{font-size:13px;line-height:1.65}.leonel-dialogue-seal{display:none}}
`;
export class LeonelDialogue{
 constructor(engine,manifest){
  this.engine=engine;this.shell=engine.host.closest('.battle-v3-live-shell');this.host=engine.host;const doc=this.shell.ownerDocument;
  this.style=doc.createElement('style');this.style.textContent=CSS;doc.head.append(this.style);
  this.root=doc.createElement('section');this.root.className='leonel-dialogue';this.root.setAttribute('aria-label','레오넬 SSS 리미티드 대사');
  this.root.innerHTML='<div class="leonel-dialogue-inner"><div class="leonel-portrait-wrap" role="img" aria-label="레오넬 얼굴"></div><div class="leonel-dialogue-copy"><div class="leonel-dialogue-name"><b>레오넬</b><span></span></div><div class="leonel-dialogue-lines"><p role="status" aria-live="polite" aria-atomic="true"></p></div></div><div class="leonel-dialogue-seal">SSS<small>LIMITED</small></div></div>';
  this.root.querySelector('.leonel-portrait-wrap').style.backgroundImage=`url('/${manifest.sourceArt.replace(/^\//,'')}')`;
  this.line=this.root.querySelector('p');this.label=this.root.querySelector('.leonel-dialogue-name span');
  for(const text of Object.values(LINES)){const p=doc.createElement('p');p.setAttribute('aria-hidden','true');p.textContent=text;this.root.querySelector('.leonel-dialogue-lines').append(p);}
  this.previousTop={value:this.host.style.getPropertyValue('top'),priority:this.host.style.getPropertyPriority('top')};this.shell.append(this.root);
  this.header=this.shell.querySelector('.battle-v3-header');this.set('idle');
  this.layout=()=>{if(this.destroyed)return;const top=this.header.getBoundingClientRect().height,height=this.root.getBoundingClientRect().height;this.root.style.top=top+'px';if(this.top!==top+height){this.top=top+height;this.host.style.setProperty('top',this.top+'px','important');engine.app.resize();doc.dispatchEvent(new Event('v3-formation-resize'));}};
  this.observer=new ResizeObserver(this.layout);this.observer.observe(this.root);this.observer.observe(this.header);this.layout();
 }
 set(mode,done=false){this.mode=mode;this.line.textContent=done&&mode==='ultimate'?LINES.victory:LINES[mode]||LINES.idle;this.label.textContent=MODES[mode]?.label||'백은의 서약';}
 diagnostics(){return{visible:!!this.root.isConnected,text:this.line.textContent,mode:this.mode,portrait:true,fullIllustration:false,placement:'BELOW_HEADER_ABOVE_CANVAS',measuredLines:Object.keys(LINES).length};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.observer.disconnect();this.root.remove();this.style.remove();this.host.style.setProperty('top',this.previousTop.value,this.previousTop.priority);}
}
