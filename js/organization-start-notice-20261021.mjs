const memory=new Set();
const storageKey=userId=>`cnine:organization-start:v1:${userId}`;
export function factionStartNoticeCandidate({items=[],userId,inLobby,now=Date.now()}){
 if(!userId||!inLobby)return null;
 return items.find(i=>i.kind==='ORGANIZATION_FACTION'&&i.phase==='ACTIVE'&&i.entityId&&i.roundId&&Date.parse(i.startedAt)<=now&&Date.parse(i.deadlineAt)>now)||null;
}
function seen(userId,key){
 if(memory.has(`${userId}:${key}`))return true;
 try{return JSON.parse(localStorage.getItem(storageKey(userId))||'[]').includes(key);}catch{return false;}
}
function remember(userId,key){
 memory.add(`${userId}:${key}`);
 try{const old=JSON.parse(localStorage.getItem(storageKey(userId))||'[]');localStorage.setItem(storageKey(userId),JSON.stringify([...new Set([...old,key])].slice(-40)));}catch{}
}
export function createFactionStartNotice({getContext,onEnter}){
 let latest={items:[],offset:0},dialog=null,timer=null,destroyed=false,opening=false,shownUser=null,shownKey=null;
 const current=()=>factionStartNoticeCandidate({...latest,...getContext(),now:Date.now()+latest.offset});
 const close=()=>{if(!dialog)return;const node=dialog;dialog=null;node.close();node.remove();};
 const tick=async()=>{
  if(destroyed)return;
  const ctx=getContext(),item=current();
  if(dialog){
   if(!item||ctx.userId!==shownUser||`${item.roundId}:${item.entityId}`!==shownKey){close();return;}
   const seconds=Math.max(0,Math.ceil((Date.parse(item.deadlineAt)-Date.now()-latest.offset)/1000));
   dialog.querySelector('[data-org-start-clock]').textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(v=>String(v).padStart(2,'0')).join(':');return;
  }
  if(opening||!item||document.hidden||document.querySelector('dialog[open],#modal.show,.modal.show'))return;
  const key=`${item.roundId}:${item.entityId}`;
  if(seen(ctx.userId,key))return;
  opening=true;
  const show=()=>{
   // Recheck after a cross-tab lock or an account/route change.
   const active=current();if(destroyed||getContext().userId!==ctx.userId||!active||`${active.roundId}:${active.entityId}`!==key||seen(ctx.userId,key)||document.hidden||document.querySelector('dialog[open],#modal.show,.modal.show'))return;
   if(!document.querySelector('[data-org-command-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/organization-command-20261021.css?v=20261021-command-v3';link.dataset.orgCommandStyle='';document.head.append(link);}
   const previous=document.activeElement,node=document.createElement('dialog');node.className='org-start-dialog';node.setAttribute('aria-labelledby','org-start-title');
   node.innerHTML='<div class="org-start-visual"><span class="org-kicker">SEOUL · FACTION WAR</span><h2 id="org-start-title">서울 세력전 개전</h2><p>우리 조직의 영역을 넓힐 시간입니다.</p></div><div class="org-start-body"><div class="org-start-status"><span>현재 회차 진행 중</span><strong data-org-start-clock></strong></div><p>서울 25개 구에서 점령전을 진행합니다.<br>종료 시 <b data-org-start-required></b>곳 이상 점령한 조직의 실제 참여자에게 보상이 지급됩니다.</p><div class="org-start-actions"><button type="button" data-org-start-enter>세력전 입장 →</button><button type="button" data-org-start-close autofocus>닫기</button></div></div>';
   node.querySelector('[data-org-start-required]').textContent=String(active.requiredTerritories??8);
   node.querySelector('[data-org-start-close]').onclick=close;
   node.querySelector('[data-org-start-enter]').onclick=()=>{close();onEnter(active.roundId);};
   node.addEventListener('cancel',e=>{e.preventDefault();close();});
   node.addEventListener('close',()=>{if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
   document.body.append(node);
   try{node.showModal();dialog=node;shownUser=ctx.userId;shownKey=key;remember(ctx.userId,key);void tick();}catch{node.remove();}
  };
  try{if(navigator.locks)await navigator.locks.request(`organization-start:${ctx.userId}:${key}`,show);else show();}finally{opening=false;}
 };
 return {update(payload){latest=payload;void tick();if(!timer)timer=setInterval(tick,1500);},destroy(){destroyed=true;clearInterval(timer);close();}};
}
