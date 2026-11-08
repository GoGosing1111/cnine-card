import {jointAccountRequest} from './joint-account-transport.mjs';
import {createServerClock} from '../shared/server-clock-v1.mjs';
const root='/assets/ui/legion-citadel/gate-',esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=v=>{const s=String(v||'').replace(/^\/+/, '');return /^(assets|preview)\//.test(s)&&!s.includes('..')?'/'+s:'';};
const terminal=s=>['VICTORY','DEFEAT'].includes(s);
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
export function openCitadel(trigger){
 if(active)return;
 style('/css/legion-citadel-v1.css');const d=document.createElement('dialog');active=d;d.className='citadel';d.setAttribute('aria-label','군단토벌 파티 · 불타는 성채');
 d.innerHTML='<header class="ct-bar"><div><small>군단토벌 / 파티 원정</small><h1>불타는 성채</h1></div><button data-act="close">화면 닫기</button></header><div class="ct-scroll"><div class="ct-hero"><div><small>LEGION HUNT · DUO</small><h2>불타는 성채</h2><p>잿불 성주 몰록이 내성문을 닫았다.<br>7분 동안 쏟아지는 군단을 사냥하라.</p><b>2인 협동　·　재앙급 이상</b></div></div><div class="ct-content"><p class="ct-guide">각자 용병 2명과 아이콘 2장 편성. 1단계 권장 전력은 SS 리미티드 Lv.16 또는 SSS 리미티드 Lv.10 이상입니다. 등급·레벨에 따른 편성 제한은 없습니다. 두 사람 모두 전장을 불러오면 각자 군단토벌 행동력 1회를 사용합니다. 몬스터는 빈자리에 계속 충원되며, 5분에 성주가 합류합니다. 성주를 처치한 뒤에도 사냥은 계속됩니다. 내 화면에 떨어진 아이템을 12초 안에 주우세요. 획득한 가방은 종료 후 각자 수령합니다.</p><section data-region></section><p class="ct-message" role="status" aria-live="polite"></p></div></div><div data-arena hidden></div>';
 const hero=d.querySelector('.ct-hero'),guide=d.querySelector('.ct-guide');hero.style.display='none';guide.hidden=true;
 document.body.append(d);d.showModal();const $=q=>d.querySelector(q),main=$('[data-region]'),box=$('[data-arena]'),msg=$('.ct-message'),scope=new AbortController(),sig=scope.signal,clock=createServerClock();
 let entryOpen=true,tiers=[],selectedTier='gate';
 const tierLabel=id=>{const t=tiers.find(v=>v.id===(id??'gate'));return t?t.stage+'단계 · '+t.name:state?.tierName||'재앙의 성문';};
 const paused=()=>!entryOpen&&(!state||state.status==='LOBBY'||state.status==='LOADING');
 let state=null,rooms=[],options=null,fetchOptions=null,closed=false,busy=false,epoch=0,timer,uiTimer,picker='mercenaries',selected={cardIds:[],mercenaryCodes:[]},pinnedId=null,displayKey='',createId=crypto.randomUUID(),battle=null,replay=null,mounting=null,prewarm=null,battleEpoch=0,frameIndex=-1,prKey='',preparation=null,loadingError=false,displayTest=false,loadedPart=-1,pendingPart=null,groundKey='',lastPartAttempt=0;
 const request=(name,o={})=>jointAccountRequest('legion-party/'+name,{...o,signal:sig});
 const say=m=>{if(!closed&&msg.textContent!==m)msg.textContent=m;};
 const txt=(el,v)=>{if(el&&el.textContent!==v)el.textContent=v;};
 function release(){battleEpoch++;clearInterval(uiTimer);uiTimer=null;battle?.destroy();battle=null;preparation?.close?.();preparation=null;prewarm=null;prKey='';replay=null;mounting=null;frameIndex=-1;loadedPart=-1;pendingPart=null;groundKey='';lastPartAttempt=0;loadingError=false;box.hidden=true;box.replaceChildren();d.classList.remove('in-battle');void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}
 function close(){if(closed)return;closed=true;scope.abort();clearTimeout(timer);release();d.close();d.remove();active=null;if(trigger?.isConnected)trigger.focus();}
 d.addEventListener('cancel',e=>{e.preventDefault();close();});
 window.addEventListener('pagehide',close,{signal:sig});
 const pauseNet=()=>{clearTimeout(timer);};
 function schedule(){pauseNet();if(closed||document.hidden||busy||paused())return;
  const status=state?.status;if(terminal(status))return;
  let ms=!state?8000:status==='ACTIVE'?Math.max(120,Math.min(9000,state.startsAt+(state.next??state.duration)-clock.now()+100,state.startsAt+state.duration-clock.now()+80)):status==='LOADING'?1000:2000;
  timer=setTimeout(refresh,ms);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseNet();else if(!busy)void refresh();},{signal:sig});
 async function refresh(){
  if(closed||busy||document.hidden)return;const e=++epoch,at=performance.now();pauseNet();
  try{const v=await request(state?'state?id='+state.id:'lobby');if(closed||e!==epoch)return;if(v.rooms)rooms=v.rooms;if(v.tiers)tiers=v.tiers;if('test'in v)displayTest=v.test;if('open'in v)entryOpen=v.open;apply(v.state,at);if(!loadingError)say('');}
  catch(err){if(closed||e!==epoch)return;if(err.status===404&&state){apply(null);rooms=[];}say(err.message);if(!main.firstChild)main.innerHTML='<button data-act="refresh">다시 불러오기</button>';}
  finally{if(!closed&&e===epoch)schedule();}
 }
 function ensureOptions(){
  if(!entryOpen||options||fetchOptions)return;fetchOptions=request('options').then(v=>{if(closed||!entryOpen)return;options=v;draw(true);}).catch(e=>{if(entryOpen)say(e.message);}).finally(()=>{fetchOptions=null;});
 }
 function warm(){
  if(prewarm)return prewarm;
  prewarm=(async()=>{if(lightweight()||!webglAvailable())return;await (window.ensureFeatureResources||window.CNineCoreRaidBridge?.ensureFeatureResources)('battleV2');
   if(closed||!state||paused()||terminal(state.status))return;await ensureCitadelRenderer();if(closed||!state||paused()||terminal(state.status))return;
   if(!document.hidden&&!navigator.connection?.saveData){
    const compact=matchMedia('(pointer:coarse), (max-width:860px)').matches||navigator.deviceMemory<=4;
    preparation=window.ProjectVPixiBattle?.prepareCooperativeRoom?.(root+(compact?'720':'1440')+'.webp');
    const own=options?.mercenaries.filter(m=>selected.mercenaryCodes.includes(m.id));if(own?.length)preparation?.update?.([{id:state.you,selection:{mercenaries:own.map(m=>({code:m.id,name:m.name,sourceArt:m.image,rank:m.rank}))}}],state.you);
   }
  })().catch(e=>{prewarm=null;throw e;});return prewarm;
 }
 function apply(next,sent){
  if(closed)return;if(next?.status==='CANCELLED')next=null;
  const old=state,me=next?.members.find(m=>m.id===next.you);if(next?.serverNow)clock.sample(next.serverNow,{sentAt:sent});
  if(next?.id!==pinnedId){if(pinnedId)release();pinnedId=next?.id||null;selected=next?.selection?structuredClone(next.selection):{cardIds:[],mercenaryCodes:[]};picker='mercenaries';}
  if(!next&&old){createId=crypto.randomUUID();options=null;rooms=[];}
  state=next;
  hero.style.display=paused()?'none':'';guide.hidden=paused();
  if(paused()){if(prewarm||!box.hidden)release();draw();return;}
  if(next?.status==='LOBBY'){ensureOptions();if(me?.ready&&!navigator.connection?.saveData&&!document.hidden)void warm().catch(()=>{});}
  if(next&&['LOADING','ACTIVE'].includes(next.status)){showBattle();ground();return;}
  if(!box.hidden)release();
  draw();
 }
 function draw(force=false){
  if(closed||!paused()&&['ACTIVE','LOADING'].includes(state?.status))return;
  const key=JSON.stringify([entryOpen,selectedTier,tiers,readQuality(),state?.id,state?.status,state?.members,state?.claimed,state?.drops,rooms,picker,selected,!!options,busy,displayTest]);
  if(key===displayKey&&!force)return;displayKey=key;
  const focus=document.activeElement?.dataset,restore=main.contains(document.activeElement)?[focus?.act,focus?.id]:null;
  const oldScroll=main.querySelector('.ct-grid')?.scrollTop||0;
  if(paused()){main.innerHTML='<h2 data-paused>성채 파티 입장 일시 중지</h2><p>현재 불타는 성채는 신규 파티를 모집하지 않습니다. 개인 군단토벌은 이용할 수 있습니다.</p><button data-act="refresh">운영 상태 새로고침</button>'+(state?' <button data-act="leave">대기 파티 나가기</button>':'');}
  else if(!state){main.innerHTML='<div class="ct-head"><div><small>PARTY FINDER</small><h2>모집 중인 파티</h2></div><button data-act="refresh">새로고침</button></div>'+(displayTest?'<p>테스트 모드 · 행동력 사용 및 실제 보상 지급 없음</p>':'')+
   (tiers.length?'<label class="ct-quality">개설 난이도 <select data-tier aria-label="파티 개설 난이도">'+tiers.map(t=>'<option value="'+esc(t.id)+'" '+(selectedTier===t.id?'selected':'')+'>'+esc(t.stage+'단계 · '+t.name)+'</option>').join('')+'</select></label><p>'+esc(tiers.find(t=>t.id===selectedTier)?.guide)+'</p>':'')+'<label class="ct-quality">전투 화면 <select data-quality aria-label="전투 화면">'+[['auto','기기에 맞춤'],['detail','상세 연출'],['light','경량 연출']].map(([v,n])=>'<option value="'+v+'" '+(readQuality()===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+(rooms.length?'<ul class="ct-rooms">'+rooms.map(r=>'<li><div><b>'+esc(r.host)+'</b><small>'+esc(tierLabel(r.tier))+' · 1 / 2명</small></div><button data-act="join" data-id="'+esc(r.id)+'">참가</button></li>').join('')+'</ul>':'<p class="ct-empty">모집 중인 파티가 없습니다. 파티를 만들면 다른 대원이 참가할 수 있습니다.</p>')+'<button class="ct-primary" data-act="create">파티 만들기</button>';}
  else if(terminal(state.status)){main.innerHTML='<small>'+esc(state.tierName||tierLabel(state.tier))+'</small><h2>'+(state.status==='VICTORY'?'7분 사냥 완료':'토벌대 전멸')+'</h2><p>처치 '+state.kills+' · 성주 '+(state.bosses?'처치':'미처치')+' · 내 습득 '+state.picked+'회</p><h3>내 전리품</h3>'+items(state.drops)+'<p>'+(state.test?'테스트 모드 · 실제 보상 미지급':state.claimed?'내 계정에 지급되었습니다.':'사냥 중 내 가방에 담은 전리품입니다.')+'</p>'+(state.canClaim?'<button class="ct-primary" data-act="claim">내 전리품 수령</button>':'<button class="ct-primary" data-act="leave">파티 목록으로</button>');}
  else{const mine=state.members.find(m=>m.id===state.you),group=picker==='mercenaries'?'mercenaryCodes':'cardIds',other=group==='mercenaryCodes'?'cardIds':'mercenaryCodes',eligible=selected[group],opts=options?.[picker]||[];
   main.innerHTML='<div class="ct-head"><div><small>EXPEDITION SQUAD</small><h2>'+esc(state.tierName||tierLabel(state.tier))+'　'+state.members.length+' / 2</h2></div><button data-act="leave">파티 나가기</button></div><div class="ct-members">'+state.members.map(m=>'<div><b>'+esc(m.name)+(m.id===state.you?' · 나':'')+'</b><small>'+(m.ready?'준비 완료':'편성 중')+'</small></div>').join('')+(state.members.length===1?'<div><b>빈 자리</b><small>대원 모집 중</small></div>':'')+'</div>'+
    '<div class="ct-tabs" aria-label="내 편성"><button data-act="mercenaries" aria-pressed="'+(picker==='mercenaries')+'">용병 '+selected.mercenaryCodes.length+' / 2</button><button data-act="icons" aria-pressed="'+(picker==='icons')+'">아이콘 '+selected.cardIds.length+' / 2</button></div>'+
    (!options?'<p>보유 목록을 불러오는 중입니다. <button data-act="options">다시 불러오기</button></p>':!opts.length?'<p>편성할 수 있는 '+(picker==='mercenaries'?'용병':'아이콘')+'이 없습니다.</p>':'<div class="ct-grid">'+opts.map(o=>'<button class="ct-card" data-act="pick" data-id="'+esc(o.id)+'" aria-pressed="'+eligible.includes(o.id)+'" '+(mine.ready?'disabled':'')+'>'+(art(o.image)?'<img loading="lazy" decoding="async" alt="" src="'+esc(art(o.image))+'">':'')+'<span><small>'+esc(o.rank||'ICON')+' '+(o.rank?'Lv.':'+')+esc(o.level)+'</small><b>'+esc(o.name)+'</b></span></button>').join('')+'</div>')+
    '<div class="ct-controls">'+(mine.ready?'<button data-act="unready">준비 취소</button>':'<button class="ct-primary" data-act="ready" '+(eligible.length===2&&selected[other].length===2?'':'disabled')+'>준비 완료</button>')+(state.hostId===state.you?'<button class="ct-primary" data-act="start" '+(state.members.length===2&&state.members.every(m=>m.ready)?'':'disabled')+'>두 분대 출전</button>':'<small>두 명 모두 준비하면 방장이 출전할 수 있습니다.</small>')+'</div>';
  }
  if(busy)main.querySelectorAll('button').forEach(b=>b.disabled=true);
  const grid=main.querySelector('.ct-grid');if(grid)grid.scrollTop=oldScroll;
  if(restore&&restore[0])main.querySelector('[data-act="'+CSS.escape(restore[0])+'"]'+(restore[1]?'[data-id="'+CSS.escape(restore[1])+'"]':''))?.focus({preventScroll:true});
 }
 const items=rows=>rows?.length?'<ul class="ct-items">'+rows.map(i=>'<li>'+(art(i.image)?'<img alt="" src="'+esc(art(i.image))+'">':'')+'<span><small>'+'내 가방'+'</small><b>'+esc(i.name)+' × '+i.quantity+'</b></span></li>').join('')+'</ul>':'<p>사냥 중 습득한 전리품이 없습니다.</p>';
 function unpack(frame){const ret={A:[],B:[]},row=frame?.[1]||[];for(let i=0;i<row.length;i+=3){const u=replay.units[row[i]];ret[u.side].push({...u,hp:row[i+1],shield:row[i+2]});}return ret;}
 function ground(){
  const host=box.querySelector('[data-ground]');if(!host||!state)return;
  const elapsed=clock.now()-(state.startsAt||0),items=(state.ground||[]).filter(x=>x.expires>elapsed),key=items.map(x=>x.token).join('|');
  if(key!==groundKey){groundKey=key;host.innerHTML=items.map((x,i)=>'<button data-act="pickup" data-id="'+esc(x.token)+'" style="left:'+([12,43,73][x.pos%3])+'%;top:'+(Math.floor(x.pos/3)?56:26)+'%">'+(art(x.image)?'<img alt="" src="'+esc(art(x.image))+'">':'')+'<span>'+esc(x.name)+' × '+x.quantity+'</span></button>').join('');}
  txt(box.querySelector('[data-farm-count]'),'처치 '+state.kills+' · 내 가방 '+(state.picked||0)+(state.magnet?' · 자석 수집':''));
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
   try{const [v,{mountCoopBattle}]=await Promise.all([request('battle?id='+id+'&part='+Math.min(Math.ceil(state.duration/30000)-1,Math.max(0,Math.floor((clock.now()-(state.startsAt||clock.now()))/30000)))),import('/raid/cooperative/battle.mjs?citadel=1'),warm().catch(()=>{liteOnly=true;})]);if(!valid())return;
    replay=v.replay;replay.frames=v.chunk.frames;loadedPart=v.part;replay.payload.battleV2.result.timeline=v.chunk.events;const {manifest,forms}=replay.payload.cooperativeEncounter.citadel;for(const [slot,n,t,elite] of manifest){const f=forms[t];replay.units.push({id:n===-1?'B:4:CITADEL:BOSS':'B:'+slot+':CITADEL'+(n?':R'+n:''),side:'B',slot,maxHp:f.maxHp*(elite?2:1),maxShield:f.maxShield,isBoss:f.isBoss});}const host=box.querySelector('.coop-battle-mount');let mounted;if(!lightweight()&&webglAvailable()){try{mounted=await mountCoopBattle(host,replay.payload,{title:'군단토벌 · 불타는 성채',playerName:'성채 토벌대',clock});}catch{if(!valid())return;liteOnly=true;preparation?.close?.();preparation=null;void window.ProjectVPixiBattle?.releaseBattle?.({onlyIfIdle:true})?.catch?.(()=>{});}}if(!mounted)mounted=mountLite(host,replay.payload,replay.units);
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
  if(kind==='pick'){if(!state||state.members.find(m=>m.id===state.you)?.ready)return;const group=picker==='mercenaries'?'mercenaryCodes':'cardIds',arr=selected[group];if(arr.includes(id))selected[group]=arr.filter(v=>v!==id);else if(arr.length<2)arr.push(id);else{say('선택한 슬롯을 해제한 뒤 다른 대원을 고르세요.');return;}say('');draw();return;}
  busy=true;pauseNet();const e=++epoch;draw(true);say('');
  const body=kind==='create'?{requestId:createId,...(tiers.length?{tier:selectedTier}:{})}:kind==='join'?{id}:kind==='ready'?{id:state.id,...selected}:{id:state.id};
  try{const at=performance.now(),v=await request(kind,{method:'POST',body});if(closed||e!==epoch)return;apply(v.state,at);
   if(kind==='leave'){busy=false;void refresh();return;}
  }catch(err){if(!closed){if(err.code==='CITADEL_PAUSED'&&(!state||['LOBBY','LOADING'].includes(state.status))){entryOpen=false;apply(state);}say(err.message);if(kind==='create'&&err.code==='CITADEL_OLD')createId=crypto.randomUUID();}}
  finally{if(!closed){busy=false;draw();schedule();}}
 }
 d.addEventListener('change',e=>{if(!state&&e.target.matches('[data-tier]')&&tiers.some(t=>t.id===e.target.value)){selectedTier=e.target.value;createId=crypto.randomUUID();draw();return;}if(!state&&e.target.matches('[data-quality]')){const quality=e.target.value;if(['auto','detail','light'].includes(quality)){try{localStorage.setItem(qualityKey,quality);}catch{}liteOnly=false;}}});
 d.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)void act(b.dataset.act,b.dataset.id);});
 main.innerHTML='<p>모집 중인 파티를 확인하고 있습니다.</p>';void refresh();return {close};
}

