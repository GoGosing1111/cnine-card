import {jointAccountRequest} from './joint-account-transport.mjs';
import {createServerClock} from '../shared/server-clock-v1.mjs';
const root='/assets/ui/legion-citadel/gate-',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=v=>{const s=String(v||'').replace(/^\/+/, '');return /^(assets|preview)\//.test(s)&&!s.includes('..')?'/'+s:'';};
const terminal=s=>['VICTORY','DEFEAT'].includes(s);
const coinNumber=new Intl.NumberFormat('ko-KR');
function style(href){if(!document.querySelector('link[href="'+href+'"]')){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}}
let active=null,bundleUpgrade,liteOnly=false,hasGL;
const qualityKey='cnine_citadel_display_v1';
function readQuality(){try{return localStorage.getItem(qualityKey)||'auto';}catch{return 'auto';}}
function lightweight(){const quality=readQuality();if(liteOnly||quality==='light')return true;if(quality==='detail')return false;
 // Twenty simultaneous combatants: on touch WebKit avoid creating a GPU battlefield before the fast scene.
 return /iP(?:hone|ad|od)/.test(navigator.userAgent)||(/Mac/.test(navigator.platform)&&navigator.maxTouchPoints>1);
}
function webglAvailable(){
 if(hasGL!==undefined)return hasGL;
 try{const c=document.createElement('canvas'),gl=c.getContext('webgl2');hasGL=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{hasGL=false;}return hasGL;
}
function mountLite(host,payload,units){
 const sprite=v=>art(window.cnineBattleSpriteUrl?.(v)||v),team=payload.battleV2.teams.A,cards=[...team.cards,...team.mercenaries],allies=new Map(cards.map((c,i)=>[c.id,{index:i,name:c.title||c.name,src:sprite(c.battleSprite||c.image||c.sourceArt)}]));
 const {manifest,forms}=payload.cooperativeEncounter.citadel,enemies=new Map(units.filter(u=>u.side==='B').map((u,i)=>[u.id,{index:manifest[i][0],name:(manifest[i][3]?'정예 ':'')+forms[manifest[i][2]].title,src:sprite(forms[manifest[i][2]].battleSprite)}]));
 const arena=document.createElement('div');arena.className='ct-lite';arena.setAttribute('aria-label','성채 전투 · 경량 화면');host.replaceChildren(arena);
 const surface=document.createElement('canvas'),ctx=surface.getContext('2d');if(ctx){
  arena.append(surface);const cache=new Map();let fighters,frame=0,dead=false,w=0,h=0;
  function queue(){if(!dead&&!frame)frame=requestAnimationFrame(paint);}
  function bitmap(url){if(!url)return null;if(cache.has(url))return cache.get(url);cache.set(url,null);const img=new Image();img.decoding='async';
   img.onload=()=>{if(dead||!img.naturalWidth)return;const proxy=document.createElement('canvas'),r=Math.min(1,104/img.naturalWidth,100/img.naturalHeight);proxy.width=Math.max(1,Math.round(img.naturalWidth*r));proxy.height=Math.max(1,Math.round(img.naturalHeight*r));const c=proxy.getContext('2d');if(c){c.drawImage(img,0,0,proxy.width,proxy.height);cache.set(url,proxy);queue();}};img.src=url;return null;}
  const tiles=new Map(),previous=new Map();let nextBitmap=0;
  function tile(v,boss,tw,th){const key=v.src+'|'+v.name+'|'+boss+'|'+tw+'x'+th,photo=bitmap(v.src),saved=tiles.get(key);if(saved&&saved.photo===photo)return saved;
   const cv=document.createElement('canvas');cv.width=tw;cv.height=th;const c=cv.getContext('2d');c.fillStyle=boss?'#66331f':'#14202de6';c.fillRect(0,0,tw,th);
   if(photo){const r=Math.min(tw/photo.width,(th-15)/photo.height),iw=Math.round(photo.width*r),ih=Math.round(photo.height*r);c.drawImage(photo,Math.round((tw-iw)/2),Math.round((th-15-ih)/2),iw,ih);}
   c.fillStyle='#fff';c.textAlign='center';c.font=(w<650?'10':'12')+'px sans-serif';c.fillText(v.name||'',tw/2,th-4,tw-2);
   const row={cv,photo,version:++nextBitmap};tiles.set(key,row);return row;}
  function paint(){frame=0;if(dead||!fighters||!w||!h||document.hidden)return;const mobile=w<650,cols=mobile?3:4,gap=mobile?2:6,half=(w-12)/2,tw=Math.max(4,Math.floor((half-cols*gap)/cols)),th=Math.floor(Math.min(mobile?63:95,Math.max(23,(h-4*gap)/4))),present=new Set();
   for(const [j,side] of ['A','B'].entries()){const rows=Math.ceil((j?12:8)/cols),top=(h-rows*(th+gap))/2;for(const f of fighters[side]){const v=(j?enemies:allies).get(f.id);if(!v||f.hp<=0)continue;
    const i=j*12+v.index,x=Math.round((j?half+12:0)+(v.index%cols)*(tw+gap)),y=Math.round(top+Math.floor(v.index/cols)*(th+gap)),t=tile(v,!!f.isBoss,tw,th),bar=Math.round(tw*Math.max(0,Math.min(1,f.hp/Math.max(1,f.maxHp)))),old=previous.get(i);present.add(i);
    if(old?.v===t.version&&old.bar===bar)continue;
    if(old?.v!==t.version){ctx.clearRect(x,y,tw,th);ctx.drawImage(t.cv,x,y);}else ctx.clearRect(x,y+th-2,tw,2);
    ctx.fillStyle=j?'#f78664':'#9ddd89';if(bar)ctx.fillRect(x,y+th-2,bar,2);previous.set(i,{v:t.version,bar,x,y,tw,th});
   }}
   for(const [i,old] of previous)if(!present.has(i)){ctx.clearRect(old.x,old.y,old.tw,old.th);previous.delete(i);}
  }
  const resize=()=>{const a=surface.getBoundingClientRect(),width=Math.round(a.width),height=Math.round(a.height);if(width>0&&height>0&&(width!==w||height!==h)){surface.width=w=width;surface.height=h=height;previous.clear();tiles.clear();queue();}};const observer=new ResizeObserver(resize);observer.observe(surface);resize();
  return {append(){},update({state}){if(state?.fighters){fighters=state.fighters;const summary='성채 전투 · 아군 '+fighters.A.filter(f=>f.hp>0).length+'명 · 적 '+fighters.B.filter(f=>f.hp>0).length+'명';if(surface.getAttribute('aria-label')!==summary)surface.setAttribute('aria-label',summary);queue();}},destroy(){dead=true;observer.disconnect();cancelAnimationFrame(frame);cache.clear();tiles.clear();previous.clear();surface.width=surface.height=0;arena.remove();}};
 }
 const slots=[8,12].map((n,j)=>{const side=document.createElement('div');side.className=j?'ct-enemy':'ct-ally';arena.append(side);return Array.from({length:n},()=>{const node=document.createElement('figure'),img=document.createElement('img'),name=document.createElement('figcaption'),hp=document.createElement('i');node.hidden=true;img.alt='';img.decoding='async';node.append(img,name,hp);side.append(node);return {node,img,name,hp};});});
 return {append(){},update({state}){if(!state?.fighters)return;for(const [j,side] of ['A','B'].entries()){const found=new Set();for(const f of state.fighters[side]){const info=(j?enemies:allies).get(f.id);if(!info||f.hp<=0)continue;const v=slots[j][info.index];found.add(info.index);v.node.hidden=false;
 if(v.id!==f.id){v.id=f.id;if(v.img.getAttribute('src')!==info.src&&info.src)v.img.src=info.src;v.name.textContent=info.name;v.node.classList.toggle('ct-boss',!!f.isBoss);v.last=null;}
 if(v.last!==f.hp){const hit=v.last!==null&&v.last>f.hp;v.last=f.hp;v.hp.style.transform='scaleX('+Math.max(0,Math.min(1,f.hp/Math.max(1,f.maxHp)))+')';if(hit&&!document.hidden)v.node.classList.toggle('ct-hit',!v.node.classList.contains('ct-hit'));}}
 slots[j].forEach((v,i)=>{if(!found.has(i))v.node.hidden=true;});}},destroy(){arena.remove();}};
}
async function ensureCitadelRenderer(){
 if(window.ProjectVPixiBattle?.legionCitadelVersion===1)return;
 // An installed shell may already have a cached V3 bundle from another game mode.
 if(!bundleUpgrade)bundleUpgrade=new Promise((resolve,reject)=>{const script=document.createElement('script');script.async=true;script.src='/preview/project-v-v3/project-v-pixi-battle.bundle.js?citadel=1&compat=1';
 script.onload=()=>window.ProjectVPixiBattle?.legionCitadelVersion===1?resolve():reject(Error('성채 전투 화면을 다시 불러오세요.'));script.onerror=()=>reject(Error('성채 전투 화면을 내려받지 못했습니다.'));document.head.append(script);}).finally(()=>{bundleUpgrade=null;});
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
function citadelCrest() {
  const icons=window.SoopTacticalIcons;
  return icons?.resolve('citadel')==='citadel'?icons.html('citadel','ct-crest'):glyph('gate');
}
function expeditionGuide() {
  const quality=[['auto','기기에 맞춤'],['detail','상세 연출'],['light','경량 연출']];
  const choices=quality.map(([v,n])=>'<option value="'+v+'" '+(readQuality()===v?'selected':'')+'>'+n+'</option>').join('');
  return '<details class="ct-details"><summary>원정 규칙과 화면 설정'+glyph('chevron')+'</summary><div class="ct-rules">'+
    '<div><b>편성 및 입장</b><p>각자 용병 2명과 아이콘 2장을 자유롭게 편성합니다. 두 사람의 전장 로딩이 끝나면 각자 행동력 1을 사용합니다.</p></div>'+
    '<div><b>성주와 전리품</b><p>5분에 성주가 합류하고, 처치 후에도 7분까지 사냥합니다. 솔로 재앙의 필드 아이템과 장비는 각자 재앙의 1.3배 확률로 얻습니다. 필드 전리품은 12초 안에 주우세요. 성주 처치 확정 연마석과 처치 코인은 자동 누적되며 전투 종료 후 수령합니다.</p></div>'+
    '<label class="ct-quality">전투 화면 <select data-quality aria-label="전투 화면">'+choices+'</select></label></div></details>';
}
function finder({open,tiers,selectedTier,rooms,tierLabel,waiting,test}) {
  const tier=tiers.find(t=>t.id===selectedTier)||tiers[0];
  const cards=tiers.map(t=>'<label class="ct-tier"><input type="radio" name="ct-tier" data-tier value="'+esc(t.id)+'" '+(tier?.id===t.id?'checked':'')+'>'+
    '<span class="ct-tier-face">'+glyph(t.id)+'<span><small>'+esc(t.stage)+'단계</small><b>'+esc(t.name)+'</b></span></span></label>').join('');
  const refresh='<button type="button" class="ct-refresh" data-act="refresh" aria-label="모집 상태 새로고침">'+glyph('refresh')+'<span>새로고침</span></button>';
  const create=open?'<button type="button" class="ct-primary ct-create" data-act="create">'+glyph('plus')+'파티 만들기'+glyph('arrow')+'</button>':
    '<div class="ct-locked" data-paused>'+glyph('lock')+'파티 입장 일시 중지</div>';
  const roomList=rooms.map(r=>'<li><span class="ct-party-flag">'+glyph('banner')+'</span><div><b>'+esc(r.host)+'</b><small>'+esc(tierLabel(r.tier))+' · 1/2명</small></div><button class="ct-join" data-act="join" data-id="'+esc(r.id)+'">참가'+glyph('arrow')+'</button></li>').join('');
  const empty='<div class="ct-quiet">'+glyph(open?'banner':'lock')+'<b>'+(open?'모집 중인 파티가 없습니다':'현재 모집이 닫혀 있습니다')+'</b><p>'+(open?'먼저 파티를 만들고 함께할 대원을 기다려 보세요.':'모집이 열리면 이곳에서 파티를 찾을 수 있습니다.')+'</p></div>';
  return (test&&open?'<p class="ct-test">테스트 모드 · 행동력과 실제 보상을 사용하지 않습니다.</p>':'')+
    '<div class="ct-finder"><section class="ct-panel ct-departure"><h2>원정 난이도</h2>'+
    (cards?'<fieldset class="ct-tiers" aria-label="파티 개설 난이도">'+cards+'</fieldset><p class="ct-recommend"><b>권장</b><span>'+esc((tier.guide||'').replace(/^권장\s+|\s*권장$/g,''))+'</span></p>'+
     (tier.uniqueFamilies?.length?'<p class="ct-recommend"><b>성주 전리품</b><span>'+esc(tier.uniqueFamilies.join(' · '))+'<br>모든 성주가 유니크 1~3단계를 드롭하며, 상위 성주일수록 확률이 조금 높습니다.</span></p>':''):'')+create+'</section>'+
    '<section class="ct-panel ct-board"><div class="ct-panel-head"><h2>모집 중인 파티'+(open?'<span class="ct-count">'+rooms.length+'</span>':'')+'</h2>'+refresh+'</div>'+
    (open&&rooms.length?'<ul class="ct-rooms">'+roomList+'</ul>':empty)+(waiting?'<button data-act="leave">대기 파티 나가기</button>':'')+'</section></div>'+expeditionGuide();
}

export function openCitadel(trigger,firstRead=null){
 if(active){firstRead?.controller.abort();return;}

 style('/css/legion-citadel-v1.css?v=3');
 const d=document.createElement('dialog');
 active=d;d.className='citadel';d.setAttribute('aria-labelledby','ct-title');
 d.innerHTML='<header class="ct-bar"><div class="ct-brand">'+citadelCrest()+'<b>군단토벌 파티</b></div><button type="button" class="ct-close" data-act="close" aria-label="화면 닫기">'+glyph('close')+'</button></header>'+
   '<div class="ct-scroll"><div class="ct-hero"><picture aria-hidden="true"><source media="(max-width:700px)" srcset="'+root+'720.webp"><img alt="" src="'+root+'1440.webp" decoding="async" width="1440" height="810"></picture>'+
   '<div class="ct-hero-copy"><div class="ct-status" data-ct-status>모집 확인 중</div><h1 id="ct-title">불타는 성채</h1><p>밀려드는 군단을 사냥하고, 잿불 성주 몰록을 처치하세요.</p></div></div>'+
   '<ul class="ct-facts"><li>'+glyph('people')+'<span>원정 인원 <b>2인 협동</b></span></li><li>'+glyph('clock')+'<span>사냥 시간 <b>7분</b></span></li><li>'+glyph('bag')+'<span>전리품 <b>개인 획득</b></span></li></ul>'+
   '<div class="ct-content"><section data-region></section><p class="ct-message" role="status" aria-live="polite"></p></div></div><div data-arena hidden></div>';
 document.body.append(d);d.showModal();const $=q=>d.querySelector(q),main=$('[data-region]'),box=$('[data-arena]'),msg=$('.ct-message'),scope=new AbortController(),sig=scope.signal,clock=createServerClock();
 let readingEpoch=null,entryOpen=true,resolved=false,tiers=[],selectedTier='gate';
 const tierLabel=id=>{const t=tiers.find(v=>v.id===(id??'gate'));return t?t.stage+'단계 · '+t.name:state?.tierName||'재앙의 성문';};
 const paused=()=>!entryOpen&&(!state||state.status==='LOBBY'||state.status==='LOADING');
 let state=null,rooms=[],options=null,fetchOptions=null,closed=false,busy=false,epoch=0,timer,uiTimer,picker='mercenaries',selected={cardIds:[],mercenaryCodes:[]},pinnedId=null,displayKey='',createId=crypto.randomUUID(),battle=null,replay=null,mounting=null,prewarm=null,battleEpoch=0,frameIndex=-1,prKey='',preparation=null,loadingError=false,displayTest=false,loadedPart=-1,pendingPart=null,groundKey='',lastPartAttempt=0;
 const request=(name,o={})=>jointAccountRequest('legion-party/'+name,{...o,signal:sig});
 const say=m=>{if(!closed&&msg.textContent!==m)msg.textContent=m;};
 const txt=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};
 function release(){battleEpoch++;clearInterval(uiTimer);uiTimer=null;battle?.destroy();battle=null;preparation?.close?.();preparation=null;prewarm=null;prKey='';replay=null;mounting=null;frameIndex=-1;loadedPart=-1;pendingPart=null;groundKey='';lastPartAttempt=0;loadingError=false;box.hidden=true;box.replaceChildren();d.classList.remove('in-battle','ct-light-field');void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}
 function close(){if(closed)return;closed=true;scope.abort();firstRead?.controller.abort();clearTimeout(timer);release();d.close();d.remove();active=null;if(trigger?.isConnected)trigger.focus?.({preventScroll:true});}
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
 window.addEventListener('pagehide',close,{signal:sig});
 const pauseNet=()=>{clearTimeout(timer);};
 function schedule(){pauseNet();if(closed||document.hidden||busy||!resolved||paused())return;
  const status=state?.status;if(terminal(status))return;
  let ms=!state?8000:status==='ACTIVE'?Math.max(120,Math.min(9000,state.startsAt+(state.next??state.duration)-clock.now()+100,state.startsAt+state.duration-clock.now()+80)):status==='LOADING'?1000:2000;
  timer=setTimeout(refresh,ms);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseNet();else if(!busy)void refresh();},{signal:sig});
 async function refresh(initial=null){
  if(closed||busy||document.hidden||readingEpoch===epoch)return;const e=++epoch,at=initial?.sentAt??performance.now();readingEpoch=e;pauseNet();
  try{const v=await (initial?.lobby||request(state?'state?id='+state.id:'lobby'));if(closed||e!==epoch)return;if(v.rooms)rooms=v.rooms;if(v.tiers)tiers=v.tiers;if('test'in v)displayTest=v.test;if('open'in v)entryOpen=v.open;resolved=true;apply(v.state,at);if(!loadingError)say('');}
  catch(err){if(closed||e!==epoch)return;if(err.status===404&&state){apply(null);rooms=[];}say(err.message);if(!resolved){txt($('[data-ct-status]'),'연결 확인 필요');txt(main.querySelector('[role="status"]'),'모집 정보를 불러오지 못했습니다.');}if(!main.firstChild)main.innerHTML='<button data-act="refresh">다시 불러오기</button>';}
  finally{if(readingEpoch===e)readingEpoch=null;if(!closed&&e===epoch)schedule();}
 }
 function ensureOptions(){
  if(!entryOpen||options||fetchOptions)return;fetchOptions=request('options').then(v=>{if(closed||!entryOpen)return;options=v;draw(true);}).catch(e=>{if(entryOpen)say(e.message);}).finally(()=>{fetchOptions=null;});
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
  if(next?.id!==pinnedId){if(pinnedId)release();pinnedId=next?.id||null;selected=next?.selection?structuredClone(next.selection):{cardIds:[],mercenaryCodes:[]};picker='mercenaries';}
  if(!next&&old){createId=crypto.randomUUID();options=null;rooms=[];}
  state=next;
  d.classList.toggle('ct-in-room',!!next&&!paused());
  const notice=$('[data-ct-status]');
  const label=paused()?'입장 일시 중지':terminal(next?.status)?'원정 종료':next?'대원 집결':displayTest?'테스트 모집':'파티 모집 중';
  txt(notice,label);notice.dataset.status=paused()?'paused':next?'party':'open';
  if(paused()){if(prewarm||!box.hidden)release();draw();return;}
  if(next?.status==='LOBBY'){
   ensureOptions();
   if((me?.ready||next.members.length===2)&&!navigator.connection?.saveData&&!document.hidden)void warm().catch(()=>{});
  }
  if(next&&['LOADING','ACTIVE'].includes(next.status)){showBattle();ground();return;}
  if(!box.hidden)release();
  draw();
 }
 function draw(force=false){
  if(closed||!paused()&&['ACTIVE','LOADING'].includes(state?.status))return;
  const key=JSON.stringify([entryOpen,selectedTier,tiers,readQuality(),state?.id,state?.status,state?.members,state?.claimed,state?.drops,state?.coins,rooms,picker,selected,!!options,busy,displayTest]);
  if(key===displayKey&&!force)return;displayKey=key;
  const focus=document.activeElement?.dataset,restore=main.contains(document.activeElement)?[focus?.act,focus?.id]:null;
  const oldScroll=main.querySelector('.ct-grid')?.scrollTop||0;
  const openGuide=!!main.querySelector('.ct-details[open]');
  const control=main.contains(document.activeElement)?document.activeElement:null;
  const choice=control?.matches('[data-tier]')?control.value:null;
  const inGuide=control?.matches('summary')?'summary':control?.matches('[data-quality]')?'[data-quality]':null;
  if(!state||paused()){
   main.innerHTML=finder({open:entryOpen&&resolved,tiers,selectedTier,rooms,tierLabel,waiting:!!state,test:displayTest});
  }
  else if(terminal(state.status)){
   const coins=state.coins?'<p><b>처치 코인 '+coinNumber.format(state.coins)+'</b></p>':'';
   main.innerHTML='<small>'+esc(state.tierName||tierLabel(state.tier))+'</small><h2>'+(state.status==='VICTORY'?'7분 사냥 완료':'토벌대 전멸')+'</h2><p>처치 '+state.kills+' · 성주 '+(state.bosses?'처치':'미처치')+' · 내 습득 '+state.picked+'회</p><h3>내 전리품</h3>'+coins+(state.drops?.length||!coins?items(state.drops):'')+
    '<p>'+(state.test?'테스트 모드 · 실제 보상 미지급':state.claimed?'내 계정에 지급되었습니다.':'습득한 보상을 내 계정으로 수령하세요.')+'</p>'+(state.canClaim?'<button class="ct-primary" data-act="claim">내 전리품 수령</button>':'<button class="ct-primary" data-act="leave">파티 목록으로</button>');
  }
  else{const mine=state.members.find(m=>m.id===state.you),group=picker==='mercenaries'?'mercenaryCodes':'cardIds',other=group==='mercenaryCodes'?'cardIds':'mercenaryCodes',eligible=selected[group],opts=options?.[picker]||[];
   const seats=state.members.map(m=>'<div class="ct-seat"><span class="ct-seat-icon">'+glyph('people')+'</span><div><small>'+(m.id===state.hostId?'방장':'대원')+(m.id===state.you?' · 나':'')+'</small><b>'+esc(m.name)+'</b></div><span class="ct-seat-state" data-ready="'+!!m.ready+'">'+(m.ready?'준비 완료':'편성 중')+'</span></div>').join('');
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
  txt(box.querySelector('[data-farm-count]'),'처치 '+state.kills+' · 내 가방 '+(state.drops?.length||0)+'종'+(state.magnet?' · 자석 수집':''));
 }
 function ahead(elapsed){
  const dest=Math.max(0,Math.floor(elapsed/replay.chunkMs)),next=dest>loadedPart?dest:loadedPart+1;
  if(next>=replay.chunkCount||next<=loadedPart||pendingPart!==null||next===loadedPart+1&&elapsed<next*replay.chunkMs-9000||performance.now()-lastPartAttempt<1200)return;
  const gen=battleEpoch;pendingPart=next;lastPartAttempt=performance.now();
  void request('chunk?id='+state.id+'&part='+next).then(v=>{if(closed||gen!==battleEpoch)return;
   const frames=replay.frames.slice(Math.max(0,frameIndex));replay.frames=[...frames,...v.chunk.frames];frameIndex=frames.length?0:-1;
   battle.append(v.chunk.events);loadedPart=next;
  }).catch(()=>{}).finally(()=>{if(gen===battleEpoch)pendingPart=null;});
 }
 function clockHud(){
  if(!battle||!replay||!state||closed||document.hidden)return;const elapsed=state.startsAt?Math.max(0,clock.now()-state.startsAt):0;
  ahead(elapsed);ground();const t=Math.max(0,Math.ceil((420000-elapsed)/1000)),frames=replay.frames;let idx=frameIndex;
  while(idx+1<frames.length&&frames[idx+1][0]<=elapsed)idx++;
  const label=box.querySelector('[data-stage]');if(idx!==frameIndex||prKey!==state.status){
   frameIndex=idx;prKey=state.status;const fighters=unpack(frames[idx]);
   battle.update({serverNow:clock.now(),state:{...state,fighters}});
   txt(label,state.status==='LOADING'?'두 분대 집결 중':elapsed>=300000?'성주 합류 · 군단 사냥':'군단 연속 사냥');}
  txt(box.querySelector('[data-time]'),state.status==='LOADING'?'전장 준비':Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));
 }
 function showBattle(){
  if(box.hidden){d.classList.add('in-battle');box.hidden=false;box.innerHTML='<section class="coop-battle-portal"><header class="coop-battle-top"><div><small>불타는 성채 · '+esc(state.tierName||tierLabel(state.tier))+'</small><b data-stage>두 분대 집결 중</b></div><div><small data-farm-count></small><strong data-time></strong><button data-act="leave" hidden>집결 취소</button><button data-act="close">닫기</button></div></header><div class="coop-battle-mount"></div><div data-ground aria-label="내 필드 전리품"></div><div class="coop-battle-notice" role="status">선택한 용병과 아이콘을 불러오는 중입니다.</div></section>';style('/raid/cooperative/style.css');}
  box.querySelector('[data-act="leave"]').hidden=state.status!=='LOADING';
  if(battle){clockHud();return;}if(mounting||loadingError)return;
  const gen=++battleEpoch,id=state.id,valid=()=>!closed&&gen===battleEpoch&&state?.id===id;
  mounting=(async()=>{
   try{
    const part=Math.min(Math.ceil(state.duration/30000)-1,Math.max(0,Math.floor((clock.now()-(state.startsAt||clock.now()))/30000)));
    const detail=!lightweight()&&webglAvailable();
    const rendererReady=detail?Promise.all([import('/raid/cooperative/battle.mjs?citadel=1'),warm()])
     .then(([renderer])=>renderer).catch(()=>{liteOnly=true;return null;}):null;
    const [v,renderer]=await Promise.all([request('battle?id='+id+'&part='+part),rendererReady]);
    if(!valid())return;
    replay=v.replay;replay.frames=v.chunk.frames;loadedPart=v.part;replay.payload.battleV2.result.timeline=v.chunk.events;const {manifest,forms}=replay.payload.cooperativeEncounter.citadel;for(const [slot,n,t,elite] of manifest){const f=forms[t];replay.units.push({id:n===-1?'B:4:CITADEL:BOSS':'B:'+slot+':CITADEL'+(n?':R'+n:''),side:'B',slot,maxHp:f.maxHp*(elite?2:1),maxShield:f.maxShield,isBoss:f.isBoss});}
    const host=box.querySelector('.coop-battle-mount');let mounted;if(renderer){try{mounted=await renderer.mountCoopBattle(host,replay.payload,{title:'군단토벌 · 불타는 성채',playerName:'성채 토벌대',clock});}catch{if(!valid())return;liteOnly=true;preparation?.close?.();preparation=null;void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}}if(!mounted){d.classList.add('ct-light-field');mounted=mountLite(host,replay.payload,replay.units);}
    if(!valid()){mounted.destroy();return;}battle=mounted;battle.update({state,serverNow:clock.now(),payload:replay.payload});frameIndex=-1;prKey='';clockHud();
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
  const body=kind==='create'?{requestId:createId,...(tiers.length?{tier:selectedTier}:{})}:kind==='join'?{id}:kind==='ready'?{id:state.id,...selected}:{id:state.id};
  try{const at=performance.now(),v=await request(kind,{method:'POST',body});if(closed||e!==epoch)return;apply(v.state,at);
   if(kind==='leave'){busy=false;void refresh();return;}
  }catch(err){if(!closed){if(err.code==='CITADEL_PAUSED'&&(!state||['LOBBY','LOADING'].includes(state.status))){entryOpen=false;apply(state);}say(err.message);if(kind==='create'&&err.code==='CITADEL_OLD')createId=crypto.randomUUID();}}
  finally{if(!closed){busy=false;draw();schedule();}}
 }
 d.addEventListener('change',e=>{if((!state||paused())&&e.target.matches('[data-tier]')&&tiers.some(t=>t.id===e.target.value)){selectedTier=e.target.value;createId=crypto.randomUUID();draw();return;}if(!state&&e.target.matches('[data-quality]')){const quality=e.target.value;if(['auto','detail','light'].includes(quality)){try{localStorage.setItem(qualityKey,quality);}catch{}liteOnly=false;}}});
 d.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)void act(b.dataset.act,b.dataset.id);});
 main.innerHTML='<div class="ct-initial"><p role="status">원정 모집 현황을 확인하고 있습니다.</p><button data-act="refresh">다시 불러오기</button></div>';void refresh(firstRead);return {close};
}

