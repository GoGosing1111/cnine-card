import {jointAccountRequest} from './joint-account-transport.mjs';
import {createServerClock} from '../shared/server-clock-v1.mjs';
import {CITADEL_BOARDS, citadelStation} from '../shared/cooperative-battleground-v1.mjs?citadel=2';
const root='/assets/ui/legion-citadel/gate-',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=v=>{const s=String(v||'').replace(/^\/+/, '');return /^(assets|preview)\//.test(s)&&!s.includes('..')?'/'+s:'';};
const terminal=s=>['VICTORY','DEFEAT'].includes(s);
const coinNumber=new Intl.NumberFormat('ko-KR');
function style(href){if(!document.querySelector('link[href="'+href+'"]')){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}}
let active=null,bundleUpgrade,liteOnly=false,hasGL;
const qualityKey='cnine_citadel_display_v1';
function readQuality(){try{return localStorage.getItem(qualityKey)||'auto';}catch{return 'auto';}}
function lightweight(){
 const quality=readQuality();
 if(liteOnly||quality==='light')return true;
 if(quality==='detail')return false;
 return /iP(?:hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1) || navigator.connection?.saveData===true || (navigator.deviceMemory>0&&navigator.deviceMemory<=2);
}
let iconSprites;
function loadIconSprites(){
 if(!iconSprites){
  const url=window.ProjectVTierBattleArt?.constants?.MANIFEST_URLS?.ICON||'/assets/ui/project-v/characters/icon/manifest-v1.json?v=20261029-four-live-v1';
  iconSprites=fetch(url,{credentials:'same-origin'}).then(async r=>{
   if(!r.ok)throw Error('ICON_ART');const m=await r.json();
   return new Map(m.characters.map(c=>[c.cardId,c.battleSprite]));
  }).catch(()=>{iconSprites=null;return new Map();});
 }
 return iconSprites;
}
function webglAvailable(){
 if(hasGL!==undefined)return hasGL;
 try{const c=document.createElement('canvas'),gl=c.getContext('webgl2');hasGL=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{hasGL=false;}return hasGL;
}
// Both renderers use the same physical slots, including later generations of a monster.
function fieldSlot(unit, payload) {
 if(unit.side==='B')return {kind:'cards',index:unit.slot,enemy:true};
 const kind=unit.isMercenary?'mercenaries':'cards',index=payload.battleV2.teams.A[kind].findIndex(a=>a.id===unit.id);
 return index>=0?{kind,index,enemy:false}:null;
}
function litePlane(node) {
 const rect=node.getBoundingClientRect(), compact=rect.width<650;
 const board=CITADEL_BOARDS[compact?'compact':'desktop'];
 return {left:rect.left,top:rect.top,sx:rect.width/board.width,sy:rect.height/board.height,compact};
}
function liteTile(info, w, h) {
 const compact=w<650, board=CITADEL_BOARDS[compact?'compact':'desktop'];
 const p=citadelStation(info.kind,info.index,info.enemy,compact);
 const tw=Math.max(4,Math.floor(Math.min(info.enemy?112:134,w*(compact?(info.enemy ? .216 : .31):.095))));
 const th=Math.max(8,Math.floor(Math.min(info.enemy?100:132,h*(compact?(info.enemy ? .088 : .112):.145))));
 return {tw,th,x:Math.round(p.x*w/board.width-tw/2),y:Math.round(p.y*h/board.height-th)};
}

function mountLite(host,payload,units,icons){
 const sprite=v=>art(window.cnineBattleSpriteUrl?.(v)||v),team=payload.battleV2.teams.A,allies=new Map();
 for(const kind of ['cards','mercenaries'])for(const [index,c] of team[kind].entries()){
  const file=c.projectVBattleArt?.primaryUrl||c.battleSprite||icons.get(c.cardId)||'assets/ui/project-v/fallback/unassigned-card-unit-sd-v1.png';
  allies.set(c.id,{kind,index,enemy:false,name:c.title||c.name,src:sprite(file)});
 }
 const {manifest,forms}=payload.cooperativeEncounter.citadel,enemies=new Map(units.filter(u=>u.side==='B').map((u,i)=>[u.id,{kind:'cards',enemy:true,index:manifest[i][0],name:(manifest[i][3]?'정예 ':'')+forms[manifest[i][2]].title,src:sprite(forms[manifest[i][2]].battleSprite)}]));
 const arena=document.createElement('div');arena.className=payload.sceneAssetKey==='CLAN_DOCKYARD'?'ct-lite ct-dockyard':'ct-lite';arena.setAttribute('aria-label','성채 전투 · 경량 화면');host.replaceChildren(arena);
 const surface=document.createElement('canvas'),ctx=surface.getContext('2d');if(ctx){
  arena.append(surface);const cache=new Map();let fighters,frame=0,dead=false,w=0,h=0;
  function queue(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function bitmap(url){if(!url)return null;if(cache.has(url))return cache.get(url);cache.set(url,null);const img=new Image();img.decoding='async';
   img.onload=()=>{if(dead||!img.naturalWidth)return;const proxy=document.createElement('canvas'),r=Math.min(1,160/img.naturalWidth,150/img.naturalHeight);proxy.width=Math.max(1,Math.round(img.naturalWidth*r));proxy.height=Math.max(1,Math.round(img.naturalHeight*r));const c=proxy.getContext('2d');if(c){c.drawImage(img,0,0,proxy.width,proxy.height);cache.set(url,proxy);queue();}};img.src=url;return null;}
  const tiles=new Map(),previous=new Map();let nextBitmap=0;
  function tile(v,boss,tw,th){const key=v.src+'|'+v.name+'|'+boss+'|'+tw+'x'+th,photo=bitmap(v.src),saved=tiles.get(key);if(saved&&saved.photo===photo)return saved;
   const cv=document.createElement('canvas');cv.width=tw;cv.height=th;const c=cv.getContext('2d');
   c.beginPath();c.ellipse(tw/2,th-14,tw*.38,Math.max(2,th*.045),0,0,Math.PI*2);
   c.fillStyle=boss?'#6e382caa':v.enemy?'#49201dbb':'#1a3847bb';c.fill();
   if(photo){const r=Math.min(tw/photo.width,(th-15)/photo.height),iw=Math.round(photo.width*r),ih=Math.round(photo.height*r);c.drawImage(photo,Math.round((tw-iw)/2),Math.round((th-15-ih)/2),iw,ih);}
   c.fillStyle='#0b1525db';c.fillRect(0,th-15,tw,15);c.fillStyle='#fff';c.textAlign='center';c.font=(w<650?'10':'12')+'px sans-serif';c.fillText(v.name||'',tw/2,th-4,tw-2);
   const row={cv,photo,version:++nextBitmap};tiles.set(key,row);return row;}
  function paint(){frame=0;if(dead||!fighters||!w||!h||document.hidden)return;const present=new Set();
   for(const [j,side] of ['A','B'].entries())for(const f of fighters[side]){const v=(j?enemies:allies).get(f.id);if(!v||f.hp<=0)continue;
    const i=(j?'enemy':v.kind)+v.index,{x,y,tw,th}=liteTile(v,w,h),t=tile(v,!!f.isBoss,tw,th),bar=Math.round(tw*Math.max(0,Math.min(1,f.hp/Math.max(1,f.maxHp)))),old=previous.get(i);present.add(i);
    if(old?.v===t.version&&old.bar===bar)continue;
    if(old?.v!==t.version){ctx.clearRect(x,y,tw,th);ctx.drawImage(t.cv,x,y);}else ctx.clearRect(x,y+th-2,tw,2);
    ctx.fillStyle=j?'#f78664':'#9ddd89';if(bar)ctx.fillRect(x,y+th-2,bar,2);previous.set(i,{v:t.version,bar,x,y,tw,th});
   }
   for(const [i,old] of previous)if(!present.has(i)){ctx.clearRect(old.x,old.y,old.tw,old.th);previous.delete(i);}
  }
  const resize=()=>{const a=surface.getBoundingClientRect(),width=Math.round(a.width),height=Math.round(a.height);if(width>0&&height>0&&(width!==w||height!==h)){surface.width=w=width;surface.height=h=height;previous.clear();tiles.clear();cancelAnimationFrame(frame);paint();}};const observer=new ResizeObserver(resize);observer.observe(surface);resize();
  return {projection:()=>litePlane(surface),append(){},update({state}){if(state?.fighters){fighters=state.fighters;const summary='성채 전투 · 아군 '+fighters.A.filter(f=>f.hp>0).length+'명 · 적 '+fighters.B.filter(f=>f.hp>0).length+'명';if(surface.getAttribute('aria-label')!==summary)surface.setAttribute('aria-label',summary);queue();}},destroy(){dead=true;observer.disconnect();cancelAnimationFrame(frame);cache.clear();tiles.clear();previous.clear();surface.width=surface.height=0;arena.remove();}};
 }
 const field=document.createElement('div');field.className='ct-lite-slots';arena.append(field);
 const slots=new Map();
 for(const info of [...allies.values(),...enemies.values()]){
  const key=(info.enemy?'B':info.kind)+info.index;if(slots.has(key))continue;
  const node=document.createElement('figure'),img=document.createElement('img'),name=document.createElement('figcaption'),hp=document.createElement('i');
  node.hidden=true;img.alt='';node.append(img,name,hp);node.classList.toggle('ct-hostile',!!info.enemy);field.append(node);slots.set(key,{node,img,name,hp,info});
 }
 function layout(){const {width,height}=field.getBoundingClientRect();for(const {node,info} of slots.values()){
  const {tw,th,x,y}=liteTile(info,width,height);Object.assign(node.style,{left:x+'px',top:y+'px',width:tw+'px',height:th+'px'});
 }}
 const observer=new ResizeObserver(layout);observer.observe(field);layout();
 return {projection:()=>litePlane(field),append(){},update({state}){
  if(!state?.fighters)return;const found=new Set();
  for(const f of [...state.fighters.A,...state.fighters.B]){const info=enemies.get(f.id)||allies.get(f.id);if(!info||f.hp<=0)continue;
   const v=slots.get((info.enemy?'B':info.kind)+info.index);found.add(v);v.node.hidden=false;
   if(v.id!==f.id){v.id=f.id;if(info.src&&v.img.getAttribute('src')!==info.src)v.img.src=info.src;v.name.textContent=info.name;v.node.classList.toggle('ct-boss',!!f.isBoss);}
   if(v.last!==f.hp){v.last=f.hp;v.hp.style.transform='scaleX('+Math.max(0,Math.min(1,f.hp/Math.max(1,f.maxHp)))+')';}
  }
  for(const v of slots.values())if(!found.has(v))v.node.hidden=true;
 },destroy(){observer.disconnect();arena.remove();}};
}
const compactAmount=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
export function citadelHitRows(event) {
 const hasImpact=row=>row && (row.damage>0 || row.absorbed>0 || row.dodge || row.type==='DODGE');
 // Area/combination receipts often contain the cast total as well as individual hits.
 const hits=Array.isArray(event.hits)?event.hits.filter(hasImpact):[];
 const targets=Array.isArray(event.targets)?event.targets.filter(hasImpact):[];
 const rows=hits.length?hits:targets.length?targets:hasImpact(event)?[event]:[];
 return rows.map(row=>({id:row.targetId||event.targetId,damage:Number(row.damage)||0,shield:Number(row.absorbed)||0,
  critical:!!(row.critical??event.critical),dodge:!!(row.dodge||event.type==='DODGE')})).filter(row=>row.id);
}
function mountHitReceipts(layer, projection, replay, light) {
 const allies=new Map(replay.units.filter(u=>u.side==='A').map(u=>[u.id,fieldSlot(u,replay.payload)]));
 const active=new Map(),free=[],capacity=replay.payload.cooperativeEncounter.initialIds.length;
 const canvas=light?document.createElement('canvas'):null,ctx=canvas?.getContext('2d');
 if(ctx)layer.append(canvas);
 let events=[],cursor=0,lastPart=-1,rects=[];
 const format=n=>n>=10000?compactAmount.format(n):coinNumber.format(n);
 function append(part,chunk) {
  if(part<=lastPart)return;
  lastPart=part;events=events.slice(cursor).concat(chunk).sort((a,b)=>a.combatAtMs-b.combatAtMs);cursor=0;
 }
 function paintCanvas(rect){
  const w=Math.round(rect.width),h=Math.round(rect.height);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  else for(const r of rects)ctx.clearRect(r.x-50,r.y-20,100,41);
  rects=[];ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='#16131b';
  for(const hit of active.values()){
   rects.push(hit);
   if(hit.number){ctx.font='bold 15px system-ui,sans-serif';ctx.fillStyle=hit.color;ctx.strokeText(hit.number,hit.x,hit.y,94);ctx.fillText(hit.number,hit.x,hit.y,94);}
   if(hit.barrier){ctx.font='bold 11px system-ui,sans-serif';ctx.fillStyle='#b5dbff';const y=hit.y+(hit.number?14:0);ctx.strokeText(hit.barrier,hit.x,y,94);ctx.fillText(hit.barrier,hit.x,y,94);}
  }
 }
 function tick(elapsed) {
  let expired=false;
  for(const [id,label] of active)if(elapsed>=label.until){
   if(label.node){label.node.hidden=true;free.push(label);}active.delete(id);expired=true;
  }
  const due=new Map();
  while(cursor<events.length && events[cursor].combatAtMs<=elapsed){
   const event=events[cursor++];if(event.combatAtMs<elapsed-750)continue;
   for(const hit of citadelHitRows(event)){
    const total=due.get(hit.id);if(total){total.damage+=hit.damage;total.shield+=hit.shield;total.critical||=hit.critical;}else due.set(hit.id,hit);
   }
  }
  if(!due.size&&!expired)return;
  const rect=layer.getBoundingClientRect(),plane=due.size?projection():null;
  for(const [id,hit] of due){
   if(!plane)break;let slot=allies.get(id);
   if(!slot){const match=/^B:(\d+):CITADEL(?::(?:R\d+|BOSS))?$/.exec(id);if(!match||Number(match[1])>=capacity)continue;slot={kind:'cards',index:Number(match[1]),enemy:true};}
   const p=citadelStation(slot.kind,slot.index,slot.enemy,plane.compact),anchor=plane.anchor?.(id);
   const x=Math.min(Math.max(28,(anchor?.x??(plane.left+p.x*plane.sx))-rect.left),rect.width-28);
   const y=Math.max(0,(anchor?.y??(plane.top+(p.y-(slot.enemy?69:108))*plane.sy))-rect.top);
   const number=hit.damage?'−'+format(hit.damage):hit.shield?'':'회피',barrier=hit.shield?'방벽 '+format(hit.shield):'';
   if(ctx){active.set(id,{x,y,number,barrier,color:hit.critical?'#a6f5ff':slot.enemy?'#ffec9e':'#ffaca0',until:elapsed+800});continue;}
   let label=active.get(id);
   if(!label){label=free.pop();if(!label){const node=document.createElement('div'),hp=document.createElement('b'),shield=document.createElement('small');
    node.className='ct-damage';node.append(hp,shield);layer.append(node);label={node,hp,shield};}active.set(id,label);}
   const {node,hp,shield}=label;
   node.style.left=x+'px';node.style.top=y+'px';
   node.dataset.target=id;node.dataset.damage=String(hit.damage);node.dataset.absorbed=String(hit.shield);
   node.classList.toggle('ct-incoming',!slot.enemy);node.classList.toggle('ct-critical',hit.critical);
   hp.textContent=number;shield.textContent=barrier;
   node.title='피해 '+coinNumber.format(hit.damage)+' · 방벽 '+coinNumber.format(hit.shield);
   node.hidden=false;label.until=elapsed+800;
  }
  if(ctx)paintCanvas(rect);
 }
 return {append,tick};
}
function mountLootBag(section,toast) {
 const list=section.querySelector('[data-bag-items]'),empty=section.querySelector('[data-bag-empty]'),expand=section.querySelector('button');
 const coins=section.querySelector('[data-bag-coins]'),rows=new Map();let snapshot=false,timer;
 const header=section.closest('header'),portal=header.parentElement;
 let headerHeight=0;
 const resize=new ResizeObserver(()=>{const height=Math.ceil(header.getBoundingClientRect().height);
  if(height!==headerHeight){headerHeight=height;portal.style.setProperty('--ct-head',height+'px');}});resize.observe(header);
 expand.onclick=()=>{const open=expand.getAttribute('aria-expanded')!=='true';expand.setAttribute('aria-expanded',String(open));expand.textContent=open?'접기':'전체 보기';section.classList.toggle('ct-expanded',open);};
 function update(state){
  const gains=[];
  for(const item of state.drops||[]){
   const key=item.type+'|'+item.ref;let row=rows.get(key);
   if(!row){const li=document.createElement('li'),label=document.createElement('span'),src=art(item.image);
    if(src){const image=document.createElement('img');image.src=src;image.alt='';image.decoding='async';li.append(image);}
    li.append(label);li.dataset.item=key;list.append(li);row={label,quantity:0};rows.set(key,row);}
   if(item.quantity!==row.quantity){const delta=item.quantity-row.quantity;
    row.label.textContent=item.name+' ×'+coinNumber.format(item.quantity);row.quantity=item.quantity;
    if(snapshot&&delta>0)gains.push(item.name+' ×'+coinNumber.format(delta));}
  }
  empty.hidden=rows.size>0;expand.hidden=!rows.size;
  const value='코인 '+coinNumber.format(state.coins||0);if(coins.textContent!==value)coins.textContent=value;
  if(gains.length){toast.textContent='획득 · '+gains.slice(0,2).join(', ')+(gains.length>2?' 외 '+(gains.length-2)+'종':'');
   toast.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{toast.hidden=true;},2200);}
  // A reconnect restores the entire bag without announcing it as a new pickup.
  snapshot=true;
 }
 return {update,destroy(){clearTimeout(timer);resize.disconnect();expand.onclick=null;}};
}
async function ensureCitadelRenderer(){
 if(window.ProjectVPixiBattle?.legionCitadelVersion===2)return;
 // An installed shell may already have a cached V3 bundle from another game mode.
 if(!bundleUpgrade)bundleUpgrade=new Promise((resolve,reject)=>{const script=document.createElement('script');script.async=true;script.src='/preview/project-v-v3/project-v-pixi-battle.bundle.js?citadel=2&compat=1';
 script.onload=()=>window.ProjectVPixiBattle?.legionCitadelVersion===2?resolve():reject(Error('성채 전투 화면을 다시 불러오세요.'));script.onerror=()=>reject(Error('성채 전투 화면을 내려받지 못했습니다.'));document.head.append(script);}).finally(()=>{bundleUpgrade=null;});
 return bundleUpgrade;
}
const glyphPaths = {
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5V12l3.5 2"/>',
  bag: '<path d="M8 6h8l-2 4c4 3 6 5 6 8 0 2-3 3-8 3s-8-1-8-3c0-3 2-5 6-8L8 6Zm2 4h4"/>',
  gate: '<path d="M3 20V7h2V4h3v3h2v3h4V7h2V4h3v3h2v13h-6v-4a3 3 0 0 0-6 0v4H3Z"/>',
  keep: '<path d="M3 20V9h4v3h2V6l3-3 3 3v6h2V9h4v11H3Zm7 0v-4a2 2 0 0 1 4 0v4"/>',
  throne: '<path d="m3 8 4 3 5-6 5 6 4-3-3 9H6L3 8Zm4 12h10"/><path d="m12 10 1.5 2-1.5 2-1.5-2 1.5-2Z"/>',
  refresh: '<path d="M20 6v5h-5"/><path d="M19.3 10a7.5 7.5 0 1 0-.8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m7 9 5 5 5-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/>',
  banner: '<path d="M5 21V4m0 1c4-4 9 3 15-1v10c-6 4-11-3-15 1"/>'
};
function glyph(name) {
  return '<svg class="ct-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(glyphPaths[name]||'')+'</svg>';
}
const dockArea='clan-dockyard',dockArt='/assets/ui/organization/hunts-20261023/';
const unitArt='/assets/ui/legion-citadel/enemies-v1/';
const tierArt={gate:'ash-hound',keep:'black-iron-guard',throne:'castellan-moloch'};
function illustratedIcon(src,css) {
  return '<img class="'+css+'" src="'+src+'" alt="" width="64" height="64" decoding="async">';
}
function tactical(name) {
  const icons=window.SoopTacticalIcons;
  return icons?.resolve(name)===name?icons.html(name,'ct-tactical'):glyph(({duo:'users',inventory:'bag',legion:'gate',clan:'crown'})[name]||'gate');
}
function citadelCrest() {
  const icons=window.SoopTacticalIcons;
  return icons?.resolve('citadel')==='citadel'?icons.html('citadel','ct-crest'):glyph('gate');
}
function expeditionGuide(dock,rechargeHours) {
  const quality=[['auto','기기에 맞춤'],['detail','상세 연출'],['light','경량 연출']];
  const choices=quality.map(([v,n])=>'<option value="'+v+'" '+(readQuality()===v?'selected':'')+'>'+n+'</option>').join('');
  return '<details class="ct-details"><summary>원정 규칙과 화면 설정'+glyph('chevron')+'</summary><div class="ct-rules">'+
    '<div><b>편성 및 입장</b><p>각자 용병 2명과 아이콘 2장을 편성합니다. 일반 계정은 두 사람의 로딩이 끝나 전투가 시작될 때 군단토벌 행동력 1을 사용합니다. 파티 행동력은 전투 시작 '+rechargeHours+'시간 후 1회 충전되며, 일반 파티와 클랜 전용 파티가 공유합니다.</p></div>'+
    '<div><b>성주와 전리품</b><p>5분에 성주가 합류하고, 처치 후에도 7분까지 사냥합니다. 일반 재앙 대비 아이템·장비 드랍 확률은 '+(dock?'150%':'130%')+'입니다. 필드 전리품은 12초 안에 주우세요. 성주 처치 확정 연마석과 처치 코인은 자동 누적되며 전투 종료 후 수령합니다.</p></div>'+
    '<label class="ct-quality">전투 화면 <select data-quality aria-label="전투 화면">'+choices+'</select></label></div></details>';
}
let entryTime;
function finder({open,tiers,selectedTier,rooms,tierLabel,waiting,test,nextEntryAt,unlimited,dock,lockedReason,rechargeHours}) {
  const tier=tiers.find(t=>t.id===selectedTier)||tiers[0];
  const cards=tiers.map(t=>'<label class="ct-tier"><input type="radio" name="ct-tier" data-tier value="'+esc(t.id)+'" '+(tier?.id===t.id?'checked':'')+'>'+
    '<span class="ct-tier-face" data-tier-art="'+esc(t.id)+'">'+illustratedIcon(dock?dockArt+'stage3-boss.webp':unitArt+(tierArt[t.id]||tierArt.gate)+'.webp','ct-tier-portrait')+'<span><small>'+(dock?'클랜 전용':esc(t.stage)+'단계')+'</small><b>'+esc(t.name)+'</b></span></span></label>').join('');
  const refresh='<button type="button" class="ct-refresh" data-act="refresh" aria-label="모집 상태 새로고침">'+glyph('refresh')+'<span>새로고침</span></button>';
  const disabled=nextEntryAt?' disabled':'';
  if(nextEntryAt&&!entryTime)entryTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const entryRule=test?'테스트 입장 · 행동력 소모 없음':unlimited?'OWNER 입장 무제한 · 코인 수급 시 행동력 1':'파티 행동력 '+(nextEntryAt?'0':'1')+'/1 · '+rechargeHours+'시간에 1회 충전<br>출전 시 1인당 군단토벌 행동력 1 소모';
  const entry='<p class="ct-recommend"><b>입장</b><span>'+entryRule+(nextEntryAt?'<br><strong data-next-entry>다음 입장 '+entryTime.format(nextEntryAt)+' (한국시간)</strong>':'')+'</span></p>';
  const create=open?'<button type="button" class="ct-primary ct-create" data-act="create"'+disabled+'>'+glyph('plus')+'파티 만들기'+glyph('arrow')+'</button>':
    '<div class="ct-locked" data-paused>'+glyph('lock')+esc(lockedReason||'파티 입장 일시 중지')+'</div>';
  const roomList=rooms.map(r=>'<li><span class="ct-party-flag">'+tactical('duo')+'</span><div><b>'+esc(r.host)+'</b><small>'+esc(tierLabel(r.tier))+' · 1/2명</small></div><button class="ct-join" data-act="join" data-id="'+esc(r.id)+'"'+disabled+'>참가'+glyph('arrow')+'</button></li>').join('');
  const empty='<div class="ct-quiet"><div class="ct-muster">'+tactical('clan')+'</div>'+'<b>'+(open?'모집 중인 파티가 없습니다':'현재 모집이 닫혀 있습니다')+'</b><p>'+(open?'먼저 파티를 만들고 함께할 대원을 기다려 보세요.':'모집이 열리면 이곳에서 파티를 찾을 수 있습니다.')+'</p></div>';
  return (test&&open?'<p class="ct-test">테스트 모드 · 행동력과 실제 보상을 사용하지 않습니다.</p>':'')+
    '<div class="ct-finder"><section class="ct-panel ct-departure"><h2>'+tactical('legion')+(dock?'클랜 원정':'원정 난이도')+'</h2>'+
    (cards?'<fieldset class="ct-tiers" aria-label="파티 개설 난이도">'+cards+'</fieldset><p class="ct-recommend"><b>'+(dock?'참가 조건':'권장')+'</b><span data-tier-guide>'+esc((tier.guide||'').replace(/^권장\s+|\s*권장$/g,''))+'</span></p>'+
     (tier.uniqueFamilies?.length?'<div class="ct-reliquary"><strong>성주 전리품</strong><ul>'+tier.uniqueFamilies.map((name,i)=>'<li>'+illustratedIcon('/assets/ui/mercenary-equipment/unique-regalia-20261109/'+(i+1)+'-weapon.webp','ct-armory-icon')+'<span>'+esc(name)+'</span></li>').join('')+'</ul><small>유니크 1~3단계 · 상위 성주일수록 드랍 확률 증가</small></div>':''):'')+entry+create+'</section>'+
    '<section class="ct-panel ct-board"><div class="ct-panel-head"><h2>'+tactical('duo')+(dock?'우리 클랜 파티':'모집 중인 파티')+(open?'<span class="ct-count">'+rooms.length+'</span>':'')+'</h2>'+refresh+'</div>'+
    (open&&rooms.length?'<ul class="ct-rooms">'+roomList+'</ul>':empty)+(waiting?'<button data-act="leave">대기 파티 나가기</button>':'')+'</section></div>'+expeditionGuide(dock,rechargeHours);
}

export function openCitadel(trigger,firstRead=null){
 if(active){firstRead?.controller.abort();return;}

 style('/css/legion-citadel-v1.css?v=7');
 const d=document.createElement('dialog');
 active=d;d.className='citadel';d.setAttribute('aria-labelledby','ct-title');
 d.innerHTML='<header class="ct-bar"><div class="ct-brand">'+citadelCrest()+'<b>군단토벌 파티</b></div><button type="button" class="ct-close" data-act="close" aria-label="화면 닫기">'+glyph('close')+'</button></header>'+
   '<div class="ct-scroll"><nav class="ct-areas" aria-label="토벌 전장"><button type="button" data-ct-area="public" aria-pressed="true">'+tactical('legion')+'불타는 성채</button><button type="button" data-ct-area="clan-dockyard" aria-pressed="false">'+tactical('clan')+'클랜 전용 사냥터<small data-clan-access>시즌 5 · 아지트 3단계</small></button></nav><div class="ct-hero"><picture aria-hidden="true"><source media="(max-width:700px)" srcset="'+root+'720.webp"><img alt="" src="'+root+'1440.webp" decoding="async" width="1440" height="810"></picture><img class="ct-castellan" src="'+unitArt+'castellan-moloch.webp" alt="" width="276" height="276" decoding="async">'+
   '<div class="ct-hero-copy"><div class="ct-status" data-ct-status>모집 확인 중</div><h1 id="ct-title">불타는 성채</h1><p>밀려드는 군단을 사냥하고, 잿불 성주 몰록을 처치하세요.</p></div></div>'+
   '<ul class="ct-facts"><li>'+tactical('duo')+'<span>원정 인원 <b>2인 협동</b></span></li><li>'+glyph('clock')+'<span>사냥 시간 <b>7분</b></span></li><li>'+tactical('inventory')+'<span>전리품 <b>개인 획득</b></span></li></ul>'+
   '<div class="ct-content"><section data-region></section><p class="ct-message" role="status" aria-live="polite"></p></div></div><div data-arena hidden></div>';
 document.body.append(d);d.showModal();const $=q=>d.querySelector(q),main=$('[data-region]'),box=$('[data-arena]'),msg=$('.ct-message'),scope=new AbortController(),sig=scope.signal,clock=createServerClock();
 let readingEpoch=null,entryOpen=true,resolved=false,tiers=[],selectedTier='gate',nextEntryAt=null,unlimited=false,rechargeHours=6;
 let area='public',publicOpen=false,clanOpen=false,publicRooms=[],ownRooms=[],hideout=null,heroArea='public';
 const dockSelected=()=>area===dockArea;
 const reason=()=>!hideout?.seasonOpen?'시즌 5 개막 후 입장 가능':hideout.stage<3?'소속 클랜 아지트 3단계 필요':'군단토벌 입장 일시 중지';
 function syncArea(){
  entryOpen=dockSelected()?clanOpen:publicOpen;rooms=dockSelected()?ownRooms:publicRooms;
  for(const button of d.querySelectorAll('[data-ct-area]')){
   button.disabled=!!state;button.setAttribute('aria-pressed',String(button.dataset.ctArea===area));
  }
  txt($('[data-clan-access]'),clanOpen?'드랍률 150%':!hideout?.seasonOpen?'시즌 5 개방':'아지트 3단계 필요');
  if(heroArea===area)return;heroArea=area;
  const dock=dockSelected(),banner=dock?dockArt+'stage3-dockyard.webp':null;
  $('.ct-hero source').srcset=banner||root+'720.webp';$('.ct-hero picture img').src=banner||root+'1440.webp';
  $('.ct-castellan').src=dock?dockArt+'stage3-boss.webp':unitArt+'castellan-moloch.webp';
  txt($('#ct-title'),dock?'봉쇄된 물류기지':'불타는 성채');txt($('.ct-hero-copy p'),dock?'같은 클랜원과 항만을 탈환하세요. 아이템·장비 드랍 확률 150%.':'밀려드는 군단을 사냥하고, 잿불 성주 몰록을 처치하세요.');
 }
 const tierLabel=id=>{if(dockSelected())return '봉쇄된 물류기지';const t=tiers.find(v=>v.id===(id??'gate'));return t?t.stage+'단계 · '+t.name:state?.tierName||'재앙의 성문';};
 const paused=()=>!entryOpen&&(!state||state.status==='LOBBY'||state.status==='LOADING');
 let lootBag=null,hitReceipts=null;
 let state=null,rooms=[],options=null,fetchOptions=null,closed=false,busy=false,epoch=0,timer,uiTimer,picker='mercenaries',selected={cardIds:[],mercenaryCodes:[]},pinnedId=null,displayKey='',createId=crypto.randomUUID(),battle=null,replay=null,mounting=null,prewarm=null,battleEpoch=0,frameIndex=-1,prKey='',preparation=null,loadingError=false,displayTest=false,loadedPart=-1,pendingPart=null,groundKey='',lastPartAttempt=0;
 const request=(name,o={})=>jointAccountRequest('legion-party/'+name,{...o,signal:sig});
 const say=m=>{if(!closed&&msg.textContent!==m)msg.textContent=m;};
 const txt=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};
 function release(){battleEpoch++;lootBag?.destroy();lootBag=null;hitReceipts=null;clearInterval(uiTimer);uiTimer=null;battle?.destroy();battle=null;preparation?.close?.();preparation=null;prewarm=null;prKey='';replay=null;mounting=null;frameIndex=-1;loadedPart=-1;pendingPart=null;groundKey='';lastPartAttempt=0;loadingError=false;box.hidden=true;box.replaceChildren();d.classList.remove('in-battle','ct-light-field');void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}
 function close(){if(closed)return;closed=true;scope.abort();firstRead?.controller.abort();clearTimeout(timer);release();d.close();d.remove();active=null;if(trigger?.isConnected)trigger.focus?.({preventScroll:true});}
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
 window.addEventListener('pagehide',close,{signal:sig});
 const pauseNet=()=>{clearTimeout(timer);};
 function schedule(){pauseNet();if(closed||document.hidden||busy||!resolved||paused())return;
  const status=state?.status;if(terminal(status))return;
  let ms=!state?8000:status==='ACTIVE'?Math.max(120,Math.min(9000,state.startsAt+(state.next??state.duration)-clock.now()+100,state.startsAt+state.duration-clock.now()+80)):status==='LOADING'?1000:2000;
  if(!state&&!unlimited&&!displayTest&&nextEntryAt){
   const remaining=nextEntryAt-clock.now();if(remaining>0)ms=remaining+50;
  }
  timer=setTimeout(refresh,ms);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseNet();else if(!busy)void refresh();},{signal:sig});
 async function refresh(initial=null){
  if(closed||busy||document.hidden||readingEpoch===epoch)return;const e=++epoch,at=initial?.sentAt??performance.now();readingEpoch=e;pauseNet();
  try{const v=await (initial?.lobby||request(state?'state?id='+state.id:'lobby'));if(closed||e!==epoch)return;if(v.rooms){publicRooms=v.rooms;ownRooms=v.clanRooms||[];clanOpen=v.clanOpen===true;hideout=v.clanHideout||null;publicOpen=v.open===true;}
   else if('open'in v){if(v.state?.area===dockArea)clanOpen=v.open;else publicOpen=v.open;}
   if(v.tiers)tiers=v.tiers;if('test'in v)displayTest=v.test;
   if(Number.isInteger(v.partyRechargeHours)&&v.partyRechargeHours>0)rechargeHours=v.partyRechargeHours;
   if('nextEntryAt'in v){nextEntryAt=v.nextEntryAt;unlimited=v.unlimited===true;if(!v.state)clock.sample(v.serverNow,{reset:true});}
   resolved=true;apply(v.state,at);if(!loadingError)say('');}
  catch(err){if(closed||e!==epoch)return;if(err.status===404&&state){apply(null);rooms=[];}say(err.message);if(!resolved){txt($('[data-ct-status]'),'연결 확인 필요');txt(main.querySelector('[role="status"]'),'모집 정보를 불러오지 못했습니다.');}if(!main.firstChild)main.innerHTML='<button data-act="refresh">다시 불러오기</button>';}
  finally{if(readingEpoch===e)readingEpoch=null;if(!closed&&e===epoch)schedule();}
 }
 function ensureOptions(){
  if(!entryOpen||options||fetchOptions)return;fetchOptions=request(dockSelected()?'options?area='+dockArea:'options').then(v=>{if(closed||!entryOpen)return;options=v;draw(true);}).catch(e=>{if(entryOpen)say(e.message);}).finally(()=>{fetchOptions=null;});
 }
 function warmSelectedMercenaries(){
  if(!preparation||!options||!state||document.hidden||navigator.connection?.saveData)return;
  const own=options.mercenaries.filter(m=>selected.mercenaryCodes.includes(m.id));
  if(own.length)preparation.update?.([{id:state.you,selection:{mercenaries:own.map(m=>({code:m.id,name:m.name,sourceArt:m.image,rank:m.rank}))}}],state.you);
 }
 function warm(){
  if(prewarm)return prewarm;
  const roomId=state?.id,available=()=>!closed&&state?.id===roomId&&!paused()&&!terminal(state?.status);
  prewarm=(async()=>{if(lightweight()||!webglAvailable())return;await (window.ensureFeatureResources||window.CNineCoreRaidBridge?.ensureFeatureResources)('battleV2');
   if(!available())return;await ensureCitadelRenderer();if(!available())return;
   if(!document.hidden&&!navigator.connection?.saveData){
    const compact=matchMedia('(pointer:coarse), (max-width:860px)').matches||navigator.deviceMemory<=4;
    preparation=window.ProjectVPixiBattle?.prepareCooperativeRoom?.(root+(compact?'720':'1440')+'.webp');
    warmSelectedMercenaries();
   }
  })().catch(e=>{prewarm=null;throw e;});return prewarm;
 }
 function apply(next,sent){
  if(closed)return;if(next?.status==='CANCELLED')next=null;
  const old=state,me=next?.members.find(m=>m.id===next.you);if(next?.serverNow)clock.sample(next.serverNow,{sentAt:sent});
  if(next?.nextEntryAt)nextEntryAt=next.nextEntryAt;
  if(next?.id!==pinnedId){if(pinnedId)release();pinnedId=next?.id||null;selected=next?.selection?structuredClone(next.selection):{cardIds:[],mercenaryCodes:[]};picker='mercenaries';}
  if(!next&&old){createId=crypto.randomUUID();options=null;rooms=[];}
  state=next;if(next)area=next.area||'public';syncArea();
  d.classList.toggle('ct-in-room',!!next&&!paused());
  const notice=$('[data-ct-status]');
  const label=paused()?(dockSelected()?reason():'입장 일시 중지'):terminal(next?.status)?'원정 종료':next?'대원 집결':displayTest?'테스트 모집':'파티 모집 중';
  txt(notice,label);notice.dataset.status=paused()?'paused':next?'party':'open';
  if(paused()){if(prewarm||!box.hidden)release();draw();return;}
  if(next?.status==='LOBBY'){
   ensureOptions();
   if((me?.ready||next.members.length===2)&&!navigator.connection?.saveData&&!document.hidden)void warm().catch(()=>{});
  }
  if(next&&['LOADING','ACTIVE'].includes(next.status)){showBattle();lootBag?.update(next);ground();return;}
  if(!box.hidden)release();
  draw();
 }
 function draw(force=false){
  if(closed||!paused()&&['ACTIVE','LOADING'].includes(state?.status))return;
  const blockedUntil=!unlimited&&!displayTest?nextEntryAt:null;
  const key=JSON.stringify([area,hideout?.seasonOpen,hideout?.stage,entryOpen,selectedTier,tiers,readQuality(),state?.id,state?.status,state?.members,state?.claimed,state?.drops,state?.coins,rooms,picker,selected,!!options,busy,displayTest,blockedUntil,unlimited,rechargeHours]);
  if(key===displayKey&&!force)return;displayKey=key;
  const focus=document.activeElement?.dataset,restore=main.contains(document.activeElement)?[focus?.act,focus?.id]:null;
  const oldScroll=main.querySelector('.ct-grid')?.scrollTop||0;
  const openGuide=!!main.querySelector('.ct-details[open]');
  const control=main.contains(document.activeElement)?document.activeElement:null;
  const choice=control?.matches('[data-tier]')?control.value:null;
  const inGuide=control?.matches('summary')?'summary':control?.matches('[data-quality]')?'[data-quality]':null;
  if(!state||paused()){
   main.innerHTML=finder({open:entryOpen&&resolved,dock:dockSelected(),lockedReason:dockSelected()?reason():'',tiers:dockSelected()?[{id:'gate',stage:3,name:'물류기지 탈환',guide:'소속 클랜 아지트 3단계 이상 · 클랜원 2명'}]:tiers,selectedTier,rooms,tierLabel,waiting:!!state,test:displayTest,nextEntryAt:blockedUntil,unlimited,rechargeHours});
  }
  else if(terminal(state.status)){
   const coins=state.coins?'<p><b>처치 코인 '+coinNumber.format(state.coins)+'</b></p>':'';
   main.innerHTML='<small>'+esc(state.tierName||tierLabel(state.tier))+'</small><h2>'+(state.status==='VICTORY'?'7분 사냥 완료':'토벌대 전멸')+'</h2><p>처치 '+state.kills+' · 성주 '+(state.bosses?'처치':'미처치')+' · 내 습득 '+state.picked+'회</p><h3>내 전리품</h3>'+coins+(state.drops?.length||!coins?items(state.drops):'')+
    '<p>'+(state.test?'테스트 모드 · 실제 보상 미지급':state.claimed?'내 계정에 지급되었습니다.':'습득한 보상을 내 계정으로 수령하세요.')+'</p>'+(state.canClaim?'<button class="ct-primary" data-act="claim">내 전리품 수령</button>':'<button class="ct-primary" data-act="leave">파티 목록으로</button>');
  }
  else{const mine=state.members.find(m=>m.id===state.you),group=picker==='mercenaries'?'mercenaryCodes':'cardIds',other=group==='mercenaryCodes'?'cardIds':'mercenaryCodes',eligible=selected[group],opts=options?.[picker]||[];
   const seats=state.members.map(m=>'<div class="ct-seat"><span class="ct-seat-icon">'+tactical(m.id===state.hostId?'clan':'duo')+'</span><div><small>'+(m.id===state.hostId?'방장':'대원')+(m.id===state.you?' · 나':'')+'</small><b>'+esc(m.name)+'</b></div><span class="ct-seat-state" data-ready="'+!!m.ready+'">'+(m.ready?'준비 완료':'편성 중')+'</span></div>').join('');
   const emptySeat='<div class="ct-seat ct-seat-empty"><span class="ct-seat-icon">'+glyph('plus')+'</span><div><small>두 번째 자리</small><b>대원 모집 중</b></div></div>';
   main.innerHTML='<div class="ct-head"><div><small>'+esc(tierLabel(state.tier))+'</small><h2>파티 대기실 <span class="ct-count">'+state.members.length+'/2</span></h2></div><button class="ct-leave" data-act="leave">파티 나가기</button></div><div class="ct-members">'+seats+(state.members.length===1?emptySeat:'')+'</div>'+
    '<div class="ct-tabs" aria-label="내 편성"><button data-act="mercenaries" aria-pressed="'+(picker==='mercenaries')+'">용병 '+selected.mercenaryCodes.length+' / 2</button><button data-act="icons" aria-pressed="'+(picker==='icons')+'">아이콘 '+selected.cardIds.length+' / 2</button></div>'+
    (!options?'<p>보유 목록을 불러오는 중입니다. <button data-act="options">다시 불러오기</button></p>':!opts.length?'<p>편성할 수 있는 '+(picker==='mercenaries'?'용병':'아이콘')+'이 없습니다.</p>':'<div class="ct-grid">'+opts.map(o=>'<button class="ct-card" data-act="pick" data-id="'+esc(o.id)+'" aria-pressed="'+eligible.includes(o.id)+'" '+(mine.ready?'disabled':'')+'>'+(art(o.image)?'<img loading="lazy" decoding="async" alt="" src="'+esc(art(o.image))+'">':'<span class="ct-card-mark">'+glyph(picker==='icons'?'banner':'people')+'</span>')+'<span><small>'+esc(o.rank||'ICON')+' '+(o.rank?'Lv.':'+')+esc(o.level)+'</small><b>'+esc(o.name)+'</b></span></button>').join('')+'</div>')+
    '<div class="ct-controls">'+(mine.ready?'<button data-act="unready">준비 취소</button>':'<button class="ct-primary" data-act="ready" '+(eligible.length===2&&selected[other].length===2?'':'disabled')+'>준비 완료</button>')+(state.hostId===state.you?'<button class="ct-primary" data-act="start" '+(state.members.length===2&&state.members.every(m=>m.ready)?'':'disabled')+'>두 분대 출전</button>':'<small>두 명 모두 준비하면 방장이 출전할 수 있습니다.</small>')+'</div>';
  }
  if(openGuide&&main.querySelector('.ct-details'))main.querySelector('.ct-details').open=true;
  if(choice)main.querySelector('[data-tier][value="'+CSS.escape(choice)+'"]')?.focus({preventScroll:true});
  if(inGuide)main.querySelector(inGuide)?.focus({preventScroll:true});
  if(busy)main.querySelectorAll('input,button').forEach(b=>b.disabled=true);
  const grid=main.querySelector('.ct-grid');if(grid)grid.scrollTop=oldScroll;
  if(restore&&restore[0])main.querySelector('[data-act="'+CSS.escape(restore[0])+'"]'+(restore[1]?'[data-id="'+CSS.escape(restore[1])+'"]':''))?.focus({preventScroll:true});
 }
 const items=rows=>rows?.length?'<ul class="ct-items">'+rows.map(i=>'<li>'+(art(i.image)?'<img alt="" src="'+esc(art(i.image))+'">':'')+'<span><small>'+'내 가방'+'</small><b>'+esc(i.name)+' × '+i.quantity+'</b></span></li>').join('')+'</ul>':'<p>사냥 중 습득한 전리품이 없습니다.</p>';
 function unpack(frame){const ret={A:[],B:[]},row=frame?.[1]||[];for(let i=0;i<row.length;i+=3){const u=replay.units[row[i]];ret[u.side].push({...u,hp:row[i+1],shield:row[i+2]});}return ret;}
 function ground(){
  const host=box.querySelector('[data-ground]');if(!host||!state)return;
  const elapsed=clock.now()-(state.startsAt||0),items=(state.ground||[]).filter(x=>x.expires>elapsed);
  const key=items.map(x=>[x.token,x.name,x.quantity,x.extraKinds||0].join('/')).join('|');
  if(key!==groundKey){groundKey=key;host.innerHTML=items.map(x=>'<button data-act="pickup" data-id="'+esc(x.token)+'" style="left:'+([12,43,73][x.pos%3])+'%;top:'+(Math.floor(x.pos/3)?56:26)+'%">'+(art(x.image)?'<img alt="" src="'+esc(art(x.image))+'">':'')+'<span>'+esc(x.name)+' × '+x.quantity+(x.extraKinds?' 외 '+x.extraKinds+'종':'')+'</span></button>').join('');}
  txt(box.querySelector('[data-farm-count]'),'처치 '+state.kills+(state.magnet?' · 자석 수집':''));
 }
 function ahead(elapsed){
  const dest=Math.max(0,Math.floor(elapsed/replay.chunkMs)),next=dest>loadedPart?dest:loadedPart+1;
  if(next>=replay.chunkCount||next<=loadedPart||pendingPart!==null||next===loadedPart+1&&elapsed<next*replay.chunkMs-9000||performance.now()-lastPartAttempt<1200)return;
  const gen=battleEpoch;pendingPart=next;lastPartAttempt=performance.now();
  void request('chunk?id='+state.id+'&part='+next).then(v=>{if(closed||gen!==battleEpoch)return;
   const frames=replay.frames.slice(Math.max(0,frameIndex));replay.frames=[...frames,...v.chunk.frames];frameIndex=frames.length?0:-1;
   battle.append(v.chunk.events);hitReceipts?.append(next,v.chunk.events);loadedPart=next;
  }).catch(()=>{}).finally(()=>{if(gen===battleEpoch)pendingPart=null;});
 }
 function clockHud(){
  if(!battle||!replay||!state||closed||document.hidden)return;const elapsed=state.startsAt?Math.max(0,clock.now()-state.startsAt):0;
  ahead(elapsed);ground();if(state.status==='ACTIVE')hitReceipts?.tick(elapsed);const t=Math.max(0,Math.ceil((420000-elapsed)/1000)),frames=replay.frames;let idx=frameIndex;
  while(idx+1<frames.length&&frames[idx+1][0]<=elapsed)idx++;
  const label=box.querySelector('[data-stage]');if(idx!==frameIndex||prKey!==state.status){
   frameIndex=idx;prKey=state.status;const fighters=unpack(frames[idx]);
   battle.update({serverNow:clock.now(),state:{...state,fighters}});
   txt(label,state.status==='LOADING'?'두 분대 집결 중':elapsed>=300000?'성주 합류 · 군단 사냥':'군단 연속 사냥');}
  txt(box.querySelector('[data-time]'),state.status==='LOADING'?'전장 준비':Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));
 }
 function showBattle(){
  if(box.hidden){d.classList.add('in-battle');box.hidden=false;box.innerHTML='<section class="coop-battle-portal"><header class="coop-battle-top"><div><small>'+(dockSelected()?'클랜 원정':'불타는 성채')+' · '+esc(state.tierName||tierLabel(state.tier))+'</small><b data-stage>두 분대 집결 중</b></div><div><small data-farm-count></small><strong data-time></strong><button data-act="leave" hidden>집결 취소</button><button data-act="close">닫기</button></div><section class="ct-loot" aria-label="내가 획득한 전리품"><div class="ct-loot-head"><b>획득 전리품</b><span data-bag-coins></span><button type="button" aria-expanded="false" aria-controls="ct-party-bag" hidden>전체 보기</button></div><p data-bag-empty>아직 획득한 아이템이 없습니다</p><ul id="ct-party-bag" data-bag-items></ul></section></header><div class="coop-battle-mount"></div><div class="ct-hit-layer" aria-hidden="true"></div><output class="ct-pickup" aria-live="polite" hidden></output><div data-ground aria-label="내 필드 전리품"></div><div class="coop-battle-notice" role="status">선택한 용병과 아이콘을 불러오는 중입니다.</div></section>';style('/raid/cooperative/style.css');
   lootBag=mountLootBag(box.querySelector('.ct-loot'),box.querySelector('.ct-pickup'));}
  box.querySelector('[data-act="leave"]').hidden=state.status!=='LOADING';
  if(battle){clockHud();return;}if(mounting||loadingError)return;
  const gen=++battleEpoch,id=state.id,valid=()=>!closed&&gen===battleEpoch&&state?.id===id;
  mounting=(async()=>{
   try{
    const part=Math.min(Math.ceil(state.duration/30000)-1,Math.max(0,Math.floor((clock.now()-(state.startsAt||clock.now()))/30000)));
    const detail=!lightweight()&&webglAvailable();
    const rendererReady=detail?Promise.all([import('/raid/cooperative/battle.mjs?citadel=2'),warm()])
     .then(([renderer])=>renderer).catch(()=>{liteOnly=true;return null;}):null;
    const [v,renderer,icons]=await Promise.all([request('battle?id='+id+'&part='+part),rendererReady,detail?null:loadIconSprites()]);
    if(!valid())return;
    replay=v.replay;replay.payload.citadelDamageHud=true;replay.frames=v.chunk.frames;loadedPart=v.part;replay.payload.battleV2.result.timeline=v.chunk.events;const {manifest,forms}=replay.payload.cooperativeEncounter.citadel;for(const [slot,n,t,elite] of manifest){const f=forms[t];replay.units.push({id:n===-1?'B:4:CITADEL:BOSS':'B:'+slot+':CITADEL'+(n?':R'+n:''),side:'B',slot,maxHp:f.maxHp*(elite?2:1),maxShield:f.maxShield,isBoss:f.isBoss});}
    const host=box.querySelector('.coop-battle-mount');let mounted;if(renderer){try{mounted=await renderer.mountCoopBattle(host,replay.payload,{title:'군단토벌 · 불타는 성채',playerName:'성채 토벌대',clock});}catch{if(!valid())return;liteOnly=true;preparation?.close?.();preparation=null;void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}}if(!mounted){d.classList.add('ct-light-field');const sprites=icons||await loadIconSprites();if(!valid())return;mounted=mountLite(host,replay.payload,replay.units,sprites);}
    if(!valid()){mounted.destroy();return;}battle=mounted;
    hitReceipts=mountHitReceipts(box.querySelector('.ct-hit-layer'),mounted.projection||(()=>window.ProjectVPixiBattle.citadelProjection()),replay,!!mounted.projection);
    hitReceipts.append(v.part,v.chunk.events);battle.update({state,serverNow:clock.now(),payload:replay.payload});frameIndex=-1;prKey='';clockHud();
    const notice=box.querySelector('.coop-battle-notice');notice.hidden=true;uiTimer=setInterval(clockHud,250);
    if(state.status==='LOADING'){const response=await request('loaded',{method:'POST',body:{id}});if(valid()){apply(response.state);schedule();}}
   }catch(e){if(!valid())return;loadingError=true;box.querySelector('.coop-battle-notice').hidden=false;box.querySelector('.coop-battle-notice').innerHTML=esc(e.message)+' <button data-act="retry">다시 연결</button>';say(e.message);}
   finally{if(valid())mounting=null;}
  })();
 }
 async function act(kind,id){
  if(kind==='close'){close();return;}if(busy||closed)return;
  if(kind==='pickup'){busy=true;pauseNet();const rev=++epoch;try{const v=await request('pickup',{method:'POST',body:{id:state.id,token:id}});if(!closed&&rev===epoch)apply(v.state);}catch(e){if(!closed)txt(box.querySelector('[data-stage]'),e.message);}finally{busy=false;schedule();}return;}
  if(kind==='retry'){release();void refresh();return;}
  if(kind==='options'){ensureOptions();return;}
  if(kind==='refresh'){void refresh();return;}
  if(['mercenaries','icons'].includes(kind)){picker=kind;draw();return;}
  if(kind==='pick'){
   if(!state||state.members.find(m=>m.id===state.you)?.ready)return;
   const group=picker==='mercenaries'?'mercenaryCodes':'cardIds',arr=selected[group];
   if(arr.includes(id))selected[group]=arr.filter(v=>v!==id);
   else if(arr.length<2)arr.push(id);
   else{say('선택한 슬롯을 해제한 뒤 다른 대원을 고르세요.');return;}
   if(group==='mercenaryCodes'&&selected[group].length===2&&!document.hidden&&!navigator.connection?.saveData){
    if(preparation)warmSelectedMercenaries();else void warm().catch(()=>{});
   }
   say('');draw();return;
  }
  busy=true;pauseNet();const e=++epoch;draw(true);say('');
  const body=kind==='create'?{requestId:createId,...(dockSelected()?{area:dockArea,tier:'gate'}:tiers.length?{tier:selectedTier}:{})}:kind==='join'?{id}:kind==='ready'?{id:state.id,...selected}:{id:state.id};
  try{const at=performance.now(),v=await request(kind,{method:'POST',body});if(closed||e!==epoch)return;apply(v.state,at);
   if(kind==='leave'){busy=false;void refresh();return;}
  }catch(err){if(!closed){if(err.code==='CITADEL_PAUSED'&&(!state||['LOBBY','LOADING'].includes(state.status))){entryOpen=false;apply(state);}say(err.message);if(kind==='create'&&err.code==='CITADEL_OLD')createId=crypto.randomUUID();
   if(!state&&err.code==='CITADEL_COOLDOWN'){busy=false;void refresh();}}}
  finally{if(!closed){busy=false;draw();schedule();}}
 }
 d.addEventListener('change',e=>{if((!state||paused())&&e.target.matches('[data-tier]')&&tiers.some(t=>t.id===e.target.value)){selectedTier=e.target.value;createId=crypto.randomUUID();
  const tier=tiers.find(t=>t.id===selectedTier);txt(main.querySelector('[data-tier-guide]'),(tier?.guide||'').replace(/^권장\s+|\s*권장$/g,''));return;}if(!state&&e.target.matches('[data-quality]')){const quality=e.target.value;if(['auto','detail','light'].includes(quality)){try{localStorage.setItem(qualityKey,quality);}catch{}liteOnly=false;}}});
 d.addEventListener('click',e=>{
  const areaTab=e.target.closest('[data-ct-area]');
  if(areaTab&&!areaTab.disabled&&!busy&&!state&&areaTab.dataset.ctArea!==area){
   area=areaTab.dataset.ctArea;selectedTier='gate';createId=crypto.randomUUID();options=null;apply(null);schedule();return;
  }
  const b=e.target.closest('[data-act]');if(b&&!b.disabled)void act(b.dataset.act,b.dataset.id);});
 main.innerHTML='<div class="ct-initial"><p role="status">원정 모집 현황을 확인하고 있습니다.</p><button data-act="refresh">다시 불러오기</button></div>';void refresh(firstRead);return {close};
}

