import {petEffectRows,PET_CAST_MS} from './PetSupportPresentation.mjs';

const STYLE_ID='pet-support-hud-20261018-icons';
let serial=0;
const CSS=`
.pet-support-hud{position:absolute;z-index:12;right:6px;top:42%;pointer-events:none;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;line-height:1.4}
.pet-support-hud [hidden]{display:none!important}.pet-support-rack{display:flex;flex-direction:column;gap:4px}
.pet-support-chip{--pet-color:#c4f588;display:grid;place-items:center;width:36px;height:36px;padding:4px;margin:0;border:0;border-radius:0;background:transparent!important;box-shadow:none;color:#edf6ff;cursor:pointer;pointer-events:auto;touch-action:manipulation}
.pet-support-chip>img{width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 1px 2px #000) drop-shadow(0 0 4px var(--pet-color));transition:filter .2s,opacity .2s}
.pet-support-chip[data-state=waiting]>img{opacity:.55}.pet-support-chip[data-state=casting]>img{animation:pet-support-pulse .8s ease-in-out 3}
.pet-support-chip:focus-visible{outline:2px solid var(--pet-color);outline-offset:1px}.pet-support-chip:hover>img{filter:drop-shadow(0 0 7px var(--pet-color))}
.pet-support-tooltip{position:absolute;box-sizing:border-box;width:max-content;max-width:min(260px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:auto;padding:10px 12px;background:#102032f5;border:1px solid #637a8a;border-radius:4px;box-shadow:0 3px 14px #0006;color:#edf6ff;pointer-events:auto;font-size:12px;line-height:1.5}
.pet-support-owner,.pet-support-detail{font-size:10px;color:#b6c6d7}.pet-support-name{margin:2px 0!important;font-size:13px;font-weight:750}.pet-support-effects{display:grid;gap:3px;margin:5px 0}.pet-support-effect{display:flex;align-items:center;gap:5px;font-weight:750}.pet-support-effect img{width:20px;height:20px;object-fit:contain}.pet-support-state{color:#d0eab8;font-size:10px}
.pet-support-announcement{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.pet-support-hud[data-visible=false],.battle-v3-live-shell.is-result-visible .pet-support-hud{visibility:hidden}
@keyframes pet-support-pulse{50%{filter:drop-shadow(0 0 10px var(--pet-color))}}
@media(pointer:coarse){.pet-support-chip{width:44px;height:44px;padding:8px}.pet-support-rack{gap:0}.pet-support-hud{right:2px}}
@media(prefers-reduced-motion:reduce){.pet-support-chip>img{animation:none!important;transition:none!important}}
`;
const element=(doc,tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
export class PetSupportHud{
 constructor(engine){
  this.engine=engine;this.entries=new Map();this.timers=new Set();
  const host=engine.host,doc=host?.ownerDocument;if(!doc)return;
  this.view=doc.defaultView;
  if(!doc.getElementById(STYLE_ID)){const style=doc.createElement('style');style.id=STYLE_ID;style.textContent=CSS;doc.head.append(style);}
  this.node=element(doc,'section','pet-support-hud');this.node.setAttribute('aria-label','펫 버프 · 아이콘을 누르면 효과 확인');
  this.rack=element(doc,'div','pet-support-rack');this.live=element(doc,'div','pet-support-announcement');this.live.setAttribute('role','status');this.live.setAttribute('aria-live','polite');this.live.setAttribute('aria-atomic','true');
  this.node.append(this.rack,this.live);host.append(this.node);
  this.onOutside=event=>{if(!this.node.contains(event.target))this.close();};
  this.onKey=event=>{if(event.key==='Escape')this.close();};
  this.onResize=()=>{if(this.openItem)this.position(this.openItem);};
  doc.addEventListener('pointerdown',this.onOutside);doc.addEventListener('keydown',this.onKey);this.view?.addEventListener('resize',this.onResize);
 }
 add(key,row,ownerName){
  if(!this.node)return;const doc=this.node.ownerDocument,pet=row.snapshot.definition,effects=petEffectRows(pet.buffs);if(!effects.length)return;
  const chip=element(doc,'button','pet-support-chip');chip.type='button';chip.dataset.state='waiting';chip.dataset.petCode=pet.code;chip.dataset.owner=String(row.ownerId??row.side);chip.style.setProperty('--pet-color',effects[0].color);
  const owner=ownerName||(row.side==='A'?'아군 지원':'상대 지원');
  chip.setAttribute('aria-label',`${owner} · ${pet.name} · ${effects.map(e=>e.text).join(' / ')}`);chip.setAttribute('aria-expanded','false');
  const icon=element(doc,'img','');icon.src=effects[0].icon;icon.alt='';chip.append(icon);
  const tooltip=element(doc,'div','pet-support-tooltip');tooltip.id='pet-buff-detail-'+(++serial);tooltip.hidden=true;tooltip.setAttribute('role','tooltip');chip.setAttribute('aria-describedby',tooltip.id);
  const state=element(doc,'div','pet-support-state','대기 · 전투 시작 시 1회 발동'),detail=element(doc,'div','pet-support-detail','');
  const list=element(doc,'div','pet-support-effects');
  for(const effect of effects){const item=element(doc,'div','pet-support-effect'),image=element(doc,'img','');image.src=effect.icon;image.alt='';item.style.color=effect.color;item.append(image,doc.createTextNode(effect.text));list.append(item);}
  tooltip.append(element(doc,'div','pet-support-owner',owner),element(doc,'p','pet-support-name',pet.name),list,state,detail);
  const item={chip,tooltip,state,detail,name:pet.name,effects};
  chip.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')this.open(item);});
  chip.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch'&&!tooltip.contains(event.relatedTarget)&&!item.pinned)this.close();});
  tooltip.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch'&&!chip.contains(event.relatedTarget)&&!item.pinned)this.close();});
  chip.addEventListener('focus',()=>this.open(item));chip.addEventListener('blur',()=>{if(!item.pinned)this.close();});
  chip.addEventListener('click',event=>{event.stopPropagation();if(this.openItem===item&&item.pinned)this.close();else{this.open(item);item.pinned=true;}});
  this.rack.append(chip);this.node.append(tooltip);this.entries.set(key,item);this.node.dataset.count=String(this.entries.size);
 }
 open(item){this.close();this.openItem=item;item.tooltip.hidden=false;item.chip.setAttribute('aria-expanded','true');this.position(item);}
 position(item){const rect=item.chip.getBoundingClientRect(),tip=item.tooltip.getBoundingClientRect(),origin=this.node.getBoundingClientRect(),vw=this.view.innerWidth,vh=this.view.innerHeight;item.tooltip.style.left=(Math.max(8,Math.min(vw-tip.width-8,rect.left-tip.width-8))-origin.left)+'px';item.tooltip.style.top=(Math.max(8,Math.min(vh-tip.height-8,rect.top+(rect.height-tip.height)/2))-origin.top)+'px';}
 close(){if(this.openItem){this.openItem.tooltip.hidden=true;this.openItem.pinned=false;this.openItem.chip.setAttribute('aria-expanded','false');this.openItem=null;}}
 apply(key,event,{restored=false}={}){
  const item=this.entries.get(key);if(!item)return;
  const {chip,state,detail,effects}=item;chip.dataset.state=restored?'applied':'casting';state.textContent=restored?'발동 완료 · 전투 시작 시 1회 적용':'펫 스킬 발동';
  const scope=event.ownerId?'소속 분대':'해당 진영',count=event.hits?.length||0;
  detail.textContent=`${scope} ${count}명${effects.some(e=>e.type==='START_SHIELD_PERCENT')?' · 보호막은 피해로 소모됩니다':''}`;
  if(this.openItem===item)this.position(item);if(restored)return;
  this.live.textContent=`${item.name} · ${effects.map(e=>e.text).join(' / ')} · 시작 버프 적용`;
  const timer=setTimeout(()=>{this.timers.delete(timer);if(this.destroyed)return;chip.dataset.state='applied';state.textContent='발동 완료 · 전투 시작 시 1회 적용';if(this.openItem===item)this.position(item);},PET_CAST_MS);this.timers.add(timer);
 }
 visible(value){if(this.node)this.node.dataset.visible=String(value);if(!value)this.close();}
 destroy(){this.destroyed=true;this.close();for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.entries.clear();const doc=this.node?.ownerDocument;doc?.removeEventListener('pointerdown',this.onOutside);doc?.removeEventListener('keydown',this.onKey);this.view?.removeEventListener('resize',this.onResize);this.node?.remove();}
}
