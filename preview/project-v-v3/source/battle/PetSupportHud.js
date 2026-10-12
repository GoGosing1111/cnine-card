import {petEffectRows,PET_CAST_MS} from './PetSupportPresentation.mjs';

const STYLE_ID='pet-support-hud-20261012-v3';
const PVP_WINDOW_KEY='cnine_pvp_pet_effect_window';
let windowSerial=0;
const CSS=`
.pet-support-hud{position:absolute;z-index:12;bottom:10px;left:12px;right:12px;pointer-events:none;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;line-height:1.3;container-type:inline-size}
.battle-v3-dock>.pet-support-hud{position:relative;inset:auto;flex:none;width:100%;z-index:auto}
.pet-support-hud [hidden]{display:none!important}.pet-support-rack{display:flex;justify-content:center;gap:8px;align-items:flex-end}
.pet-support-chip{--pet-color:#c4f588;position:relative;isolation:isolate;min-width:0;flex:1;max-width:280px;box-sizing:border-box;display:grid;grid-template-columns:45px minmax(0,1fr);gap:9px;padding:8px 10px 7px 7px;border:1px solid color-mix(in srgb,var(--pet-color) 38%,#283548);border-bottom:2px solid var(--pet-color);border-radius:4px 12px 4px 12px;background:linear-gradient(120deg,color-mix(in srgb,var(--pet-color) 12%,#09121e),#0a1422f5 58%);box-shadow:0 5px 20px #0008;color:#edf6ff;overflow:hidden;transition:border-color .25s,box-shadow .25s}
.pet-support-chip:before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 20%,color-mix(in srgb,var(--pet-color) 25%,transparent) 50%,transparent 80%);transform:translateX(-140%)}
.pet-support-chip[data-state=casting]{box-shadow:0 0 22px color-mix(in srgb,var(--pet-color) 30%,transparent),inset 0 0 18px color-mix(in srgb,var(--pet-color) 10%,transparent);border-color:var(--pet-color);animation:pet-support-enter .42s cubic-bezier(.2,.7,.2,1)}
.pet-support-chip[data-state=casting]:before{animation:pet-support-sheen 1.3s ease-out}.pet-support-chip[data-state=waiting]{opacity:.7}
.pet-support-portrait{width:45px;height:53px;object-fit:contain;align-self:center;filter:drop-shadow(0 0 7px color-mix(in srgb,var(--pet-color) 40%,transparent))}
.pet-support-copy{min-width:0}.pet-support-meta{display:flex;justify-content:space-between;gap:6px;align-items:center;color:#a5b5c6;font-size:9px;line-height:1.4;margin-bottom:2px}
.pet-support-owner{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pet-support-state{flex-shrink:0;color:var(--pet-color);font-weight:800;letter-spacing:.02em}.pet-support-name{font-size:12px;font-weight:750;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pet-support-effects{display:flex;gap:7px;flex-wrap:wrap;margin-top:3px}.pet-support-effect{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;color:var(--pet-color);font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}.pet-support-effect img{width:20px;height:20px;object-fit:contain}.pet-support-detail{font-size:9px;color:#9fb1c4;display:block;margin-top:4px;height:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pet-support-announcement{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);width:max-content;max-width:90%;margin:0;box-sizing:border-box;white-space:nowrap;font-size:12px;font-weight:800;letter-spacing:.09em;color:#ecf9db;background:#0c1726ef;border:1px solid #bfdc8470;padding:6px 17px;clip-path:polygon(8px 0,calc(100% - 8px) 0,100% 50%,calc(100% - 8px) 100%,8px 100%,0 50%);text-shadow:0 1px 2px #000}
.pet-support-hud[data-visible=false],.battle-v3-live-shell.is-result-visible .pet-support-hud{visibility:hidden}
@keyframes pet-support-enter{from{transform:translateY(12px);opacity:.25}to{transform:translateY(0);opacity:1}}@keyframes pet-support-sheen{to{transform:translateX(140%)}}
@container(max-width:600px){.pet-support-rack{gap:4px}.pet-support-chip{grid-template-columns:30px minmax(0,1fr);gap:4px;padding:6px 6px 5px 4px}.pet-support-portrait{width:30px;height:42px}.pet-support-name{font-size:11px}.pet-support-meta{font-size:8px;gap:3px}.pet-support-effect{font-size:11px;gap:2px}.pet-support-effect img{width:15px;height:15px}.pet-support-effects{gap:2px;margin-top:2px}.pet-support-detail{font-size:8px}.pet-support-hud[data-count='3'] .pet-support-chip,.pet-support-hud[data-count='4'] .pet-support-chip{grid-template-columns:1fr;text-align:center}.pet-support-hud[data-count='3'] .pet-support-portrait,.pet-support-hud[data-count='4'] .pet-support-portrait{position:absolute;right:2px;top:3px;width:22px;height:25px;opacity:.35}.pet-support-hud[data-count='3'] .pet-support-effects,.pet-support-hud[data-count='4'] .pet-support-effects{justify-content:center}.pet-support-announcement{font-size:10px;letter-spacing:.03em;padding:5px 11px}}
.pet-support-hud[data-compact=true]{display:flex;align-items:center;justify-content:flex-end;gap:6px}
.battle-v3-dock>.pet-support-hud[data-compact=true]{width:min(100%,620px)}
.pet-support-hud[data-compact=true] .pet-support-rack{flex:1;min-width:0;gap:4px;align-items:stretch}
.pet-support-hud[data-compact=true] .pet-support-chip{max-width:240px;grid-template-columns:24px minmax(0,1fr);gap:5px;padding:4px 6px;border-radius:4px 8px 4px 8px;box-shadow:0 2px 8px #0006;text-align:left}
.pet-support-hud[data-compact=true] .pet-support-portrait{position:static;width:24px;height:30px;opacity:1}
.pet-support-hud[data-compact=true] .pet-support-copy{display:grid;grid-template-columns:minmax(0,1fr) fit-content(40%);align-content:center;column-gap:4px}
.pet-support-hud[data-compact=true] .pet-support-meta{grid-column:2;grid-row:1;font-size:8px;margin:0;align-self:center}
.pet-support-hud[data-compact=true] .pet-support-name{grid-column:1;grid-row:1;font-size:11px}
.pet-support-hud[data-compact=true] .pet-support-effects{grid-column:1/-1;justify-content:flex-start;gap:2px 5px;margin-top:2px}
.pet-support-hud[data-compact=true] .pet-support-effect{font-size:11px;gap:2px}
.pet-support-hud[data-compact=true] .pet-support-effect img{width:13px;height:13px}
.pet-support-hud[data-compact=true] .pet-support-detail,.pet-support-hud[data-compact=true] .pet-support-state{display:none}
.pet-support-hud[data-compact=true] .pet-support-chip[data-state=applied] .pet-support-owner:after{content:' ✓';color:var(--pet-color)}
.pet-support-hud .pet-support-toggle{flex:none;display:flex;align-items:center;justify-content:center;gap:5px;min-height:36px;box-sizing:border-box;padding:7px 9px;margin:0;border:1px solid #69848e;border-radius:7px;background:#091723ed;color:#e1edf3;font:700 11px/1.2 'Noto Sans KR','Malgun Gothic',sans-serif;cursor:pointer;pointer-events:auto;touch-action:manipulation;white-space:nowrap}
.pet-support-toggle b{font-size:10px;color:#c4f588}.pet-support-toggle[aria-pressed=false]{border-color:#526171;color:#a9b9c8}.pet-support-toggle[aria-pressed=false] b{color:#a9b9c8}.pet-support-toggle:focus-visible{outline:2px solid #c4f588;outline-offset:3px}
@media(pointer:coarse){.pet-support-hud .pet-support-toggle{min-height:44px}}
@container(max-width:500px){.pet-support-hud[data-compact=true] .pet-support-chip{grid-template-columns:20px minmax(0,1fr);gap:3px;padding:4px}.pet-support-hud[data-compact=true] .pet-support-portrait{width:20px;height:27px}.pet-support-hud[data-compact=true] .pet-support-copy{grid-template-columns:minmax(0,1fr)}.pet-support-hud[data-compact=true] .pet-support-meta{grid-column:1;grid-row:1;line-height:1}.pet-support-hud[data-compact=true] .pet-support-name{grid-row:2;font-size:10px;margin-top:2px}.pet-support-hud[data-compact=true] .pet-support-effects{grid-row:3}.pet-support-hud[data-compact=true] .pet-support-effect{font-size:10px}.pet-support-hud .pet-support-toggle{min-height:44px;padding:6px;gap:3px;font-size:10px}}
@container(max-width:500px){.pet-support-hud[data-compact=true][data-count='3'] .pet-support-rack,.pet-support-hud[data-compact=true][data-count='4'] .pet-support-rack{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){.pet-support-chip,.pet-support-chip:before{animation:none!important;transition:none!important}}
`;
const element=(doc,tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
export class PetSupportHud{
 constructor(engine){
  this.engine=engine;this.entries=new Map();this.timers=new Set();
  const host=engine.host,doc=host?.ownerDocument;if(!doc)return;
  if(!doc.getElementById(STYLE_ID)){const style=doc.createElement('style');style.id=STYLE_ID;style.textContent=CSS;doc.head.append(style);}
  this.node=element(doc,'section','pet-support-hud');this.node.setAttribute('aria-label','펫 시작 버프 발동 기록');
  this.rack=element(doc,'div','pet-support-rack');this.live=element(doc,'div','pet-support-announcement');this.live.hidden=true;this.live.setAttribute('role','status');this.live.setAttribute('aria-live','polite');this.live.setAttribute('aria-atomic','true');
  this.node.append(this.live,this.rack);
  const shell=host.closest?.('.battle-v3-live-shell'),dock=shell?.querySelector('.battle-v3-dock');
  if(dock)dock.prepend(this.node);else host.append(this.node);
  const mode=String(shell?.dataset.v3Field||engine.battleData?.battleV2?.mode||engine.activeBattlefieldMode||'').toUpperCase();
  if(mode==='PVP'){
   this.node.dataset.compact='true';this.view=doc.defaultView;
   this.rack.id='pet-support-window-'+(++windowSerial);
   this.toggle=element(doc,'button','pet-support-toggle');this.toggle.type='button';this.toggle.setAttribute('aria-controls',this.rack.id);
   this.toggle.append(element(doc,'span','','펫 효과창'));this.toggleState=element(doc,'b','','ON');this.toggle.append(this.toggleState);this.node.append(this.toggle);
   let enabled=true;try{enabled=this.view.localStorage.getItem(PVP_WINDOW_KEY)!=='OFF';}catch{}
   this.setEnabled(enabled);
   this.toggle.onclick=event=>{event.stopPropagation();this.setEnabled(!this.enabled);try{this.view.localStorage.setItem(PVP_WINDOW_KEY,this.enabled?'ON':'OFF');}catch{}};
   this.onStorage=event=>{if(event.key===PVP_WINDOW_KEY||event.key===null)this.setEnabled(event.newValue!=='OFF');};
   this.view?.addEventListener('storage',this.onStorage);
  }
 }
 add(key,row,ownerName){
  if(!this.node)return;const doc=this.node.ownerDocument,pet=row.snapshot.definition,effects=petEffectRows(pet.buffs);
  const chip=element(doc,'article','pet-support-chip');chip.dataset.state='waiting';chip.dataset.petCode=pet.code;chip.dataset.owner=String(row.ownerId??row.side);chip.style.setProperty('--pet-color',effects[0]?.color||'#c4f588');
  const image=element(doc,'img','pet-support-portrait');image.src='/'+pet.battleSprite.replace(/^\//,'');image.alt='';
  const copy=element(doc,'div','pet-support-copy'),meta=element(doc,'div','pet-support-meta'),state=element(doc,'span','pet-support-state','대기');
  meta.append(element(doc,'span','pet-support-owner',ownerName||(row.side==='A'?(this.toggle?'아군':'아군 지원'):(this.toggle?'상대':'상대 지원'))),state);
  const list=element(doc,'div','pet-support-effects'),detail=element(doc,'div','pet-support-detail','전투 시작 시 1회 발동');
  for(const effect of effects){const item=element(doc,'span','pet-support-effect'),icon=element(doc,'img','');icon.src=effect.icon;icon.alt='';item.style.color=effect.color;item.append(icon,doc.createTextNode(effect.text));list.append(item);}
  copy.append(meta,element(doc,'p','pet-support-name',pet.name),list,detail);chip.append(image,copy);this.rack.append(chip);
  this.entries.set(key,{chip,state,detail,name:pet.name,effects});this.node.dataset.count=String(this.entries.size);
 }
 apply(key,event,{restored=false}={}){
  const item=this.entries.get(key);if(!item)return;
  const {chip,state,detail,effects}=item;
  chip.dataset.state=restored?'applied':'casting';state.textContent=restored?'✓ 발동 완료':'스킬 발동';
  const scope=event.ownerId?'소속 분대':'해당 진영',count=event.hits?.length||0;
  detail.textContent=`${scope} ${count}명 · ${effects.map(e=>e.title).join(' / ')}`;
  chip.title=`${item.name} · ${effects.map(e=>e.text).join(' / ')} · ${scope} ${count}명 · 전투 시작 시 1회 적용${effects.some(e=>e.type==='START_SHIELD_PERCENT')?' (보호막은 피해로 소모됩니다)':''}`;
  if(restored)return;
  this.live.textContent='펫 스킬 발동 · 시작 버프 적용';this.live.hidden=this.enabled===false;
  const timer=setTimeout(()=>{
   this.timers.delete(timer);if(this.destroyed)return;
   chip.dataset.state='applied';state.textContent='✓ 발동 완료';
   if(![...this.entries.values()].some(e=>e.chip.dataset.state==='casting'))this.live.hidden=true;
  },PET_CAST_MS);this.timers.add(timer);
 }
 setEnabled(value){
  this.enabled=!!value;this.node.dataset.enabled=String(this.enabled);this.rack.hidden=!this.enabled;
  this.toggle.setAttribute('aria-pressed',String(this.enabled));this.toggleState.textContent=this.enabled?'ON':'OFF';
  this.toggle.title=`펫 효과창 ${this.enabled?'숨기기':'보기'} · 실제 펫 버프는 항상 적용됩니다.`;
  this.toggle.setAttribute('aria-label',`펫 효과창 ${this.enabled?'ON':'OFF'} · 실제 펫 버프는 항상 적용됩니다`);
  this.live.hidden=!this.enabled||![...this.entries.values()].some(e=>e.chip.dataset.state==='casting');
 }
 visible(value){if(this.node)this.node.dataset.visible=String(value);}
 destroy(){this.destroyed=true;for(const timer of this.timers)clearTimeout(timer);this.timers.clear();this.entries.clear();this.view?.removeEventListener('storage',this.onStorage);this.node?.remove();}
}
