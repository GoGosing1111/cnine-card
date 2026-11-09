const art='/assets/ui/territory-war/draft-20261109/';
const waitMs=5*60000;
export function draftCandidate(items,now){
  return items.find(item=>{
    if(item.kind!=='TERRITORY'||!item.entityId||!item.phase?.startsWith('DRAFT_'))return false;
    const at=Date.parse(item.deadlineAt);
    if(item.phase==='DRAFT_BATTLE')return now<at;
    return ['DRAFT_WAIT','DRAFT_READY'].includes(item.phase)&&now>=at-waitMs;
  });
}

export function createDraftNotice({context,request,enter}){
  let items=[],offset=0,busy=false,dialog=null,timer=0,visibleUser=0,visibleRound=0,visibleEnd=0,active=false;
  const settled=new Set();
  const now=()=>Date.now()+offset;
  const available=()=>context().inLobby&&!document.hidden&&!Array.from(document.querySelectorAll('dialog[open],[aria-modal="true"],#modal.show,.modal.show,.quest-command-mount,#territoryWarModalV3')).some(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const schedule=ms=>{clearTimeout(timer);timer=setTimeout(()=>{timer=0;void tick()},ms)};
  const close=()=>{if(dialog)dialog.close()};
  const send=(action,roundId,delivery)=>request({action,roundId,delivery});
  const receipt=(user,id)=>'cnine:territory-draft:'+user+':'+id;
  function saved(key){try{return localStorage.getItem(key)}catch{return null}}
  function store(key,value){try{localStorage.setItem(key,value)}catch{}}
  async function acknowledge(key,id,token){
    try{await send('shown',id,token);store(key,'shown');}catch{/* Retry the same displayed order on the next lobby refresh. */}
  }
  function mount(order,user,key,token){
    const previous=document.activeElement,node=document.createElement('dialog');
    node.className='tw-draft-dialog';node.dataset.side=order.side;
    node.setAttribute('aria-labelledby','tw-draft-title');node.setAttribute('aria-describedby','tw-draft-line');
    node.innerHTML='<div class="twd-layout"><div class="twd-scene"><img class="twd-portrait" src="'+art+'commander.webp" width="640" height="960" alt="검은 정복을 입은 전선 지휘관이 차출 명령서를 내민다"><div class="twd-speaker"><small>전선사령부</small><b>작전 지휘관</b></div></div><section class="twd-brief"><div class="twd-meta"><span data-round></span><span class="twd-phase" data-phase></span></div><h2 id="tw-draft-title">차출 명령</h2><div class="twd-unit"><span>소속 진영</span><strong data-team></strong></div><p id="tw-draft-line"></p><div class="twd-actions"><button type="button" data-enter>전선으로 이동</button><button type="button" data-dismiss autofocus>명령 확인</button></div></section></div>';
    node.querySelector('[data-round]').textContent='영토전 · 제'+order.roundId+'회';
    node.querySelector('[data-team]').textContent=order.teamName;
    const paint=()=>{
      const fighting=now()>=Date.parse(order.battleAt);
      node.querySelector('[data-phase]').textContent=fighting?'교전 중':'개전 대기';
      node.querySelector('#tw-draft-line').textContent=fighting
        ?'귀관을 '+order.teamName+'에 배속한다. 전선은 이미 교전 중이다. 즉시 아군 거점에 합류하라.'
        :'차출 명령이다. 귀관을 '+order.teamName+'에 배속한다. 전투단을 점검하고 개전 신호를 기다려라.';
    };
    paint();
    node.querySelector('[data-dismiss]').onclick=()=>node.close();
    node.querySelector('[data-enter]').onclick=()=>{node.close();enter()};
    node.addEventListener('close',()=>{node.remove();if(dialog===node)dialog=null;clearTimeout(timer);timer=0;if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
    document.body.append(node);
    try{node.showModal()}catch{node.remove();return false}
    dialog=node;visibleUser=user;visibleRound=order.roundId;visibleEnd=Date.parse(order.endsAt);
    settled.add(key);store(key,token);void acknowledge(key,order.roundId,token);
    const transition=Date.parse(order.battleAt)-now(),end=Date.parse(order.endsAt)-now();
    if(transition>0){timer=setTimeout(()=>{if(dialog===node){paint();schedule(Math.max(1,Date.parse(order.endsAt)-now()))}},transition);}
    else if(end>0)schedule(end);
    return true;
  }
  async function tick(){
    const ctx=context(),item=draftCandidate(items,now());
    if(dialog){
      if(now()>=visibleEnd||!ctx.inLobby||Number(ctx.userId)!==visibleUser||Number(item?.entityId)!==visibleRound||
          (item?.phase==='DRAFT_BATTLE'&&Date.parse(item.deadlineAt)<=now()))close();
      return;
    }
    if(busy||!active||!item||!ctx.inLobby||!ctx.userId)return;
    const user=Number(ctx.userId),id=Number(item.entityId),key=receipt(user,id),stored=saved(key);
    if(stored||settled.has(key)){if(stored&&stored!=='shown')void acknowledge(key,id,stored);return}
    if(document.hidden)return;
    if(!available()){schedule(1500);return}
    const token=crypto.randomUUID();busy=true;
    try{
      const result=await send('reserve',id,token);
      if(!result.order){if(result.retry)schedule(2000);else settled.add(key);return}
      if(result.serverNow){const time=Date.parse(result.serverNow);if(Number.isFinite(time))offset=time-Date.now();}
      if(!available()||!active||Number(context().userId)!==user||Number(draftCandidate(items,now())?.entityId)!==id||
          Date.parse(result.order.endsAt)<=now()||!mount(result.order,user,key,token)){
        await send('release',id,token);if(active&&context().inLobby)schedule(1200);
      }
    }catch{if(active&&context().inLobby)schedule(3500)}
    finally{busy=false}
  }
  const resume=()=>{if(!document.hidden)void tick()};
  return {
    update(next,serverOffset){items=next;offset=serverOffset;if(!active){active=true;document.addEventListener('visibilitychange',resume)}void tick()},
    stop(){active=false;items=[];clearTimeout(timer);timer=0;document.removeEventListener('visibilitychange',resume);close()}
  };
}

