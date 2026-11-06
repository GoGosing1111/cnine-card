import {auctionCoinLabel} from '../shared/auction-user-policy-v1.mjs?v=20261103-live-v1';
const SILENT='data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA';
const POSITION_KEY='cnine_auction_bgm_position_v1';
const VOLUME_KEY='cnine_auction_bgm_volume_v1';

function readVolume(){
 try{
  const saved=JSON.parse(localStorage.getItem(VOLUME_KEY));
  if(saved&&Number.isInteger(saved.volume)&&saved.volume>=0&&saved.volume<=100)
   return {volume:saved.volume,unmuted:Number.isInteger(saved.unmuted)&&saved.unmuted>0&&saved.unmuted<=100?saved.unmuted:25};
 }catch{}
 return {volume:null,unmuted:25};
}

// Keep the preferred position relative to the usable viewport so Safari's
// keyboard/address bar and rotation cannot strand the notification offscreen.
function makeBannerMovable(banner){
 let position=.5,drag=null;
 try{const saved=localStorage.getItem(POSITION_KEY);if(saved!==null&&saved.trim()!==''&&Number.isFinite(Number(saved)))position=Math.max(0,Math.min(1,Number(saved)));}catch{}
 const viewport=window.visualViewport;
 function bounds(){
  const style=getComputedStyle(banner),top=(viewport?.offsetTop||0)+12+(parseFloat(style.getPropertyValue('--auc-bgm-safe-top'))||0);
  const bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)-12-(parseFloat(style.getPropertyValue('--auc-bgm-safe-bottom'))||0);
  return {top,bottom:Math.max(top,bottom-banner.getBoundingClientRect().height)};
 }
 function place(){if(banner.hidden)return;const {top,bottom}=bounds();banner.style.top=`${top+(bottom-top)*position}px`;}
 function move(top){const range=bounds(),height=range.bottom-range.top;const value=Math.max(range.top,Math.min(range.bottom,top));if(height>0)position=(value-range.top)/height;banner.style.top=`${value}px`;}
 function save(){try{localStorage.setItem(POSITION_KEY,String(position));}catch{}}
 function end(e){if(!drag||(e&&e.pointerId!==drag.id))return;const id=drag.id;drag=null;banner.classList.remove('is-dragging');try{if(banner.hasPointerCapture(id))banner.releasePointerCapture(id);}catch{}save();}
 function down(e){
  if(e.isPrimary===false||e.button!==0||e.target.closest('button,a,input,[data-bgm-volume-control]'))return;
  drag={id:e.pointerId,y:e.clientY,top:banner.getBoundingClientRect().top};
  try{banner.setPointerCapture(e.pointerId);}catch{}
  banner.classList.add('is-dragging');e.preventDefault();
 }
 function pointerMove(e){if(!drag||e.pointerId!==drag.id)return;e.preventDefault();move(drag.top+e.clientY-drag.y);}
 function key(e){
  if(e.target!==banner||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();const range=bounds(),step=e.shiftKey?64:24;
  move(e.key==='Home'?range.top:e.key==='End'?range.bottom:banner.getBoundingClientRect().top+(e.key==='ArrowUp'?-step:step));save();
 }
 const resize=()=>{end();place();};
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(place):null;observer?.observe(banner);
 banner.addEventListener('pointerdown',down);banner.addEventListener('pointermove',pointerMove);banner.addEventListener('pointerup',end);banner.addEventListener('pointercancel',end);banner.addEventListener('lostpointercapture',end);banner.addEventListener('keydown',key);
 window.addEventListener('resize',resize);viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',place);
 return {place,cancel:end,destroy(){end();observer?.disconnect();window.removeEventListener('resize',resize);viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',place);banner.removeEventListener('pointerdown',down);banner.removeEventListener('pointermove',pointerMove);banner.removeEventListener('pointerup',end);banner.removeEventListener('pointercancel',end);banner.removeEventListener('lostpointercapture',end);banner.removeEventListener('keydown',key);}};
}
export function auctionAudioSource(raw,sequence,base=location.href){
 const text=String(raw||''),volume=Math.max(0,Math.min(1,Number(text.match(/#av=(\d{1,3})$/)?.[1]??25)/100));
 const clean=text.replace(/#av=\d{1,3}$/,'').replace(/\\/g,'/');
 if(!clean)return {url:'',volume};
 if(/^(?:data:|blob:)/i.test(clean))return {url:clean,volume};
 const url=new URL(/^(?:https?:|\/)/i.test(clean)?clean:'/'+clean.replace(/^\.\//,''),base);url.searchParams.set('auctionAudio',String(sequence));return {url:url.href,volume};
}

// This player lives outside the rerendered auction content. Ordinary bids and
// ranking refreshes must not reload, pause or restart the current track.
export function createAuctionBgmPlayer({root,api,AudioClass=Audio,now=Date.now,pollMs=2000}){
 const events=new Map(),finished=new Set();let lotId=null,lastSequence=0,offset=0,current=null,media=null,destroyed=false,polling=false,generation=0,unlocked=false,blocked=false;
 const preference=readVolume(),controls=new Set();let trackVolume=25,gainContext=null,volumeGain=null,volumeSource=null;
 const volumePercent=()=>preference.volume??trackVolume;
 function applyVolume(value=volumePercent()/100){
  if(!media)return;
  media.muted=value===0;
  if(volumeGain)volumeGain.gain.value=value;
  media.volume=volumeGain?1:value;
 }
 function syncVolume(){
  const value=volumePercent();
  for(const node of controls){
   node.querySelector('[data-bgm-volume]').value=String(value);
   node.querySelector('[data-bgm-volume]').setAttribute('aria-valuetext',value===0?'음소거':value+'%');
   node.querySelector('[data-bgm-volume-value]').textContent=value+'%';
   const mute=node.querySelector('[data-bgm-mute]');mute.textContent=value===0?'음소거 해제':'음소거';mute.setAttribute('aria-pressed',String(value===0));
  }
 }
 function setVolume(value){
  if(destroyed||!Number.isFinite(Number(value)))return;
  preference.volume=Math.max(0,Math.min(100,Math.round(Number(value))));
  if(preference.volume>0)preference.unmuted=preference.volume;
  try{localStorage.setItem(VOLUME_KEY,JSON.stringify(preference));}catch{}
  applyVolume();syncVolume();resumeVolumeContext();
  if(blocked&&current)play(current);
 }
 function mountVolumeControl(host){
  const node=document.createElement('div');node.className='auc-bgm-volume';node.setAttribute('data-bgm-volume-control','');
  node.innerHTML='<label><span>음량</span><input type="range" min="0" max="100" step="1" aria-label="경매 BGM 음량" data-bgm-volume><output data-bgm-volume-value></output></label><button type="button" data-bgm-mute></button>';
  node.querySelector('[data-bgm-volume]').oninput=e=>setVolume(e.target.value);
  node.querySelector('[data-bgm-mute]').onclick=()=>{if(volumePercent()>0)preference.unmuted=volumePercent();setVolume(volumePercent()===0?preference.unmuted:0);};
  host.append(node);controls.add(node);syncVolume();
  return ()=>{controls.delete(node);node.remove();};
 }
 function resumeVolumeContext(){if(gainContext&&gainContext.state!=='running')void gainContext.resume().catch(()=>{});}
 const banner=document.createElement('section');banner.className='auc-bgm-event auc-skin';banner.hidden=true;banner.tabIndex=0;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.setAttribute('aria-label','BGM 입찰 알림. 위아래로 끌거나 방향키로 이동');
 banner.innerHTML='<img src="/assets/ui/tactical-20261030/auction.webp" alt="" draggable="false"><div><div class="auc-bgm-heading"><small>BGM 입찰</small><small class="auc-bgm-drag-hint" aria-hidden="true">↕ 이동</small></div><strong data-bgm-bidder></strong><span data-bgm-amount></span><q data-bgm-message hidden></q><small data-bgm-status></small><button type="button" class="auc-text-button" data-bgm-play hidden>음악 듣기</button></div>';
 document.body.append(banner);
 mountVolumeControl(banner.querySelector('div'));
 const placement=makeBannerMovable(banner);
 const clockNow=()=>now()+offset;
 function syncPlaybackStatus(){
  if(!current)return;
  const needsGesture=blocked||!!(gainContext&&gainContext.state!=='running');
  banner.querySelector('[data-bgm-play]').hidden=!needsGesture;
  banner.querySelector('[data-bgm-status]').textContent=needsGesture?'버튼을 눌러 음악을 들어보세요.':'음악 재생 중';
 }
 function audio(){
  if(!media){
   media=new AudioClass();media.preload='auto';media.playsInline=true;media.setAttribute('playsinline','');media.setAttribute('webkit-playsinline','');
   // iOS can ignore element.volume; use the same gain fallback as the lobby.
   media.volume=.5;const Context=window.AudioContext||window.webkitAudioContext;
   if(media.volume!==.5&&Context){
    try{media.crossOrigin='anonymous';gainContext=new Context();volumeGain=gainContext.createGain();volumeGain.connect(gainContext.destination);volumeSource=gainContext.createMediaElementSource(media);volumeSource.connect(volumeGain);gainContext.onstatechange=syncPlaybackStatus;}
    catch{volumeGain?.disconnect();void gainContext?.close().catch(()=>{});gainContext=null;volumeGain=null;volumeSource=null;}
   }
   applyVolume();media.addEventListener('ended',()=>{if(current)finish();});
  }
  return media;
 }
 function stopAudio(){generation++;if(media){media.pause();media.removeAttribute('src');media.load();}blocked=false;}
 function finish(){if(current)finished.add(current.id);current=null;stopAudio();placement.cancel();banner.hidden=true;}
 function show(event){banner.hidden=false;banner.querySelector('[data-bgm-bidder]').textContent=event.nickname;banner.querySelector('[data-bgm-amount]').textContent=`+${auctionCoinLabel(event.amount)} 코인`;const message=banner.querySelector('[data-bgm-message]');message.textContent=event.message||'';message.hidden=!event.message;placement.place();}
 function seek(event){if(!media||current?.id!==event.id)return;const elapsed=Math.max(0,(clockNow()-event.startsMs)/1000);try{media.currentTime=Number.isFinite(media.duration)?Math.min(elapsed,Math.max(0,media.duration-.05)):elapsed;}catch{}}
 function play(event){
  if(destroyed||clockNow()>=event.endsMs)return;const player=audio(),stamp=++generation;
  blocked=false;seek(event);resumeVolumeContext();syncPlaybackStatus();
  Promise.resolve(player.play()).then(()=>{if(destroyed||generation!==stamp)return;unlocked=true;blocked=false;syncPlaybackStatus();}).catch(()=>{
   if(destroyed||generation!==stamp)return;blocked=true;syncPlaybackStatus();
  });
 }
 function start(event){
  if(current)finish();current=event;const source=auctionAudioSource(event.bgmUrl,event.sequence);trackVolume=Math.round(source.volume*100);syncVolume();show(event);const player=audio();player.src=source.url;applyVolume();
  if(player.readyState<1)player.addEventListener('loadedmetadata',()=>seek(event),{once:true});play(event);
 }
 function tick(){
  if(destroyed)return;const at=clockNow();
  if(current&&at>=current.endsMs)finish();
  for(const [id,e] of events)if(e.endsMs<=at||finished.has(id))events.delete(id);
  if(current)return;
  const next=[...events.values()].sort((a,b)=>a.sequence-b.sequence).find(e=>e.startsMs<=at&&e.endsMs>at);
  if(next)start(next);
 }
 function ingest(payload){
  if(destroyed)return;if(Number.isFinite(payload?.serverNow))offset=payload.serverNow-now();
  for(const e of payload?.events||[]){if(e.lotId!==lotId||!e.bgmUrl||!Number.isSafeInteger(e.sequence)||!Number.isSafeInteger(e.amount)||e.amount<1||!Number.isFinite(e.startsMs)||!Number.isFinite(e.endsMs)||e.endsMs<=e.startsMs)continue;lastSequence=Math.max(lastSequence,e.sequence);if(!finished.has(e.id))events.set(e.id,e);}
  tick();
 }
 async function poll(){
  if(destroyed||polling||!lotId||document.hidden)return;const id=lotId;polling=true;
  try{const payload=await api('bgm-events',{lotId:id,after:lastSequence});if(!destroyed&&id===lotId)ingest(payload);}catch{/* retry the stream; successful bids remain committed */}finally{polling=false;}
 }
 function unlock(e){
  if(e?.target?.closest('[data-bgm-play]'))return;
  if(destroyed)return;if(current){if(blocked||(gainContext&&gainContext.state!=='running'))play(current);return;}if(unlocked)return;
  const player=audio(),stamp=++generation;player.src=SILENT;applyVolume(.001);resumeVolumeContext();
  Promise.resolve(player.play()).then(()=>{if(destroyed||generation!==stamp)return;unlocked=true;player.pause();player.removeAttribute('src');player.load();}).catch(()=>{});
 }
 banner.querySelector('[data-bgm-play]').onclick=()=>{if(current)play(current);};
 root.addEventListener('pointerdown',unlock,{passive:true});root.addEventListener('keydown',unlock);
 const pollTimer=setInterval(poll,pollMs),tickTimer=setInterval(tick,200);
 return {
  update(state){const next=state?.active?.id||null;if(next!==lotId){finish();events.clear();finished.clear();lastSequence=0;lotId=next;void poll();}},
  poll,ingest,mountVolumeControl,
  destroy(){destroyed=true;clearInterval(pollTimer);clearInterval(tickTimer);root.removeEventListener('pointerdown',unlock);root.removeEventListener('keydown',unlock);finish();placement.destroy();banner.remove();controls.clear();volumeSource?.disconnect();volumeGain?.disconnect();void gainContext?.close().catch(()=>{});}
 };
}
