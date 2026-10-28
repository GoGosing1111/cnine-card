import {WAR_CHAT_KINDS,chatRetryMs,chatText} from '../shared/war-chat-v1.mjs?v=20261028-chat2';
const docks=new Map(),token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
export function chatStyle(){if(document.querySelector('[data-war-chat-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/war-chat-v1.css?v=20261028-chat2';link.dataset.warChatStyle='';document.head.append(link);}
const read=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
const save=(key,value)=>{try{value===null?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value));}catch{}};
function selectDock(){const active=[...docks.values()].filter(d=>d.anchor.isConnected).at(-1);for(const d of docks.values())d.activate(d===active);}
export function unmountWarChat(kind){const d=docks.get(kind);if(d){d.destroy();docks.delete(kind);selectDock();}}
export function mountWarChat(kind,anchor){
 if(!Object.hasOwn(WAR_CHAT_KINDS,kind)||!anchor?.isConnected)return;
 if(docks.has(kind)){if(docks.get(kind).anchor===anchor){docks.get(kind).checkIdentity();selectDock();return;}unmountWarChat(kind);}
 chatStyle();const workspace=document.createElement('section');workspace.className='war-chat-workspace cn-command-ui';workspace.dataset.chatWorkspace=kind;
 const same=kind==='clan'?'클랜':kind==='territory'?'팀':'세력';
 workspace.innerHTML=`<nav class="war-chat-nav cn-ui-panel" aria-label="${WAR_CHAT_KINDS[kind]} 전황과 채팅"><div><strong>${WAR_CHAT_KINDS[kind]} <span>아군 통신</span></strong><small>같은 ${same}끼리 작전을 공유하세요.</small></div><div class="war-chat-nav-actions"><button type="button" class="cn-ui-button" data-chat-game>전황 보기</button><button type="button" class="cn-ui-button war-chat-launch" aria-controls="war-chat-panel-${kind}" aria-expanded="false">아군 채팅</button></div></nav>`;
 const host=document.createElement('aside');host.className='war-chat';host.dataset.warChat=kind;host.setAttribute('aria-label',WAR_CHAT_KINDS[kind]+' 아군 채팅');
 host.innerHTML=`<section id="war-chat-panel-${kind}" class="war-chat-panel cn-ui-panel" hidden><header><div><small>같은 ${same} 전용</small><strong>아군 채팅</strong></div><button type="button" class="cn-ui-button" data-chat-close>채팅 숨기기</button></header><p data-chat-status role="status">연결 준비 중</p><ol data-chat-messages role="log" aria-label="채팅 메시지" aria-live="polite" aria-relevant="additions"></ol><form><label class="war-chat-sr" for="chat-${kind}">메시지</label><textarea id="chat-${kind}" maxlength="600" rows="2" placeholder="같은 편에게 메시지 보내기 (300자)"></textarea><div><small data-chat-count>0 / 300</small><button type="submit" class="cn-ui-button primary">전송</button></div></form><footer><span>최근 100개 · 최대 24시간</span><button type="button" class="cn-ui-button" data-chat-retry>다시 연결</button></footer></section>`;
 anchor.before(workspace);anchor.classList.add('war-chat-surface');workspace.append(anchor,host);
 const nav=workspace.querySelector('.war-chat-nav'),size=new ResizeObserver(()=>workspace.style.setProperty('--war-chat-nav-height',Math.ceil(nav.getBoundingClientRect().height)+'px'));size.observe(nav);
 const $=s=>host.querySelector(s),panel=$('.war-chat-panel'),launch=workspace.querySelector('.war-chat-launch'),game=workspace.querySelector('[data-chat-game]'),input=$('textarea'),send=$('[type=submit]'),list=$('[data-chat-messages]'),status=$('[data-chat-status]');
 let opened=read('war-chat:open:'+kind)===true,active=false,destroyed=false,socket=null,timer=0,heartbeat=0,timeout=0,abort=null,generation=0,attempt=0,room='',you=0,credential='',offset=0,pending=null,ready=false,sequence=0;
 const key='war-chat:pending:'+kind;
 function note(text){status.textContent=text;}
 function lock(){send.disabled=!ready||Boolean(pending);input.disabled=!ready||Boolean(pending);}
 function disconnect(){generation++;ready=false;clearTimeout(timer);clearTimeout(timeout);clearInterval(heartbeat);timer=timeout=heartbeat=0;abort?.abort();abort=null;const old=socket;socket=null;if(old){old.onclose=old.onmessage=old.onerror=null;old.close();}lock();}
 function resetIdentity(){disconnect();list.replaceChildren();sequence=0;room='';you=0;pending=null;input.value='';credential=token();}
 function checkIdentity(){if(credential&&credential!==token()){resetIdentity();if(active&&opened&&!document.hidden)void connect();}}
 function running(){return !destroyed&&active&&opened&&!document.hidden&&dock.anchor.isConnected;}
 function retry(){if(!running())return;note('연결이 끊어졌습니다. 다시 연결 중…');timer=setTimeout(()=>void connect(),chatRetryMs(attempt++));}
 function add(message){
  if(!Number.isSafeInteger(message.seq)||message.seq<=sequence)return;sequence=message.seq;
  const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60,li=document.createElement('li'),head=document.createElement('div'),name=document.createElement('b'),time=document.createElement('time'),text=document.createElement('p');
  li.classList.toggle('mine',message.userId===you);name.textContent=message.name+(message.userId===you?' · 나':'');time.textContent=new Date(message.created).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});text.textContent=message.body;head.append(name,time);li.append(head,text);list.append(li);while(list.children.length>100)list.firstChild.remove();if(atBottom)list.scrollTop=list.scrollHeight;
 }
 function transmit(){if(!pending||!ready||socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({type:'send',nonce:pending.nonce,body:pending.body,sent:pending.sent}));note('전송 확인 중…');clearTimeout(timeout);timeout=setTimeout(()=>{note('전송 결과를 다시 확인합니다.');socket?.close();},8000);}
 async function connect(){
  disconnect();if(!running())return;if(!token()){note('로그인 후 채팅을 이용하세요.');return;}
  if(credential&&credential!==token())resetIdentity();credential=token();const mine=++generation;note('같은 편 채팅방에 연결 중…');abort=new AbortController();timeout=setTimeout(()=>abort?.abort(),10000);
  try{
   let clientId=localStorage.getItem('cnine_player_client_id_v1552')||'';if(!/^[a-zA-Z0-9:_-]{12,120}$/.test(clientId)){clientId=crypto.randomUUID();localStorage.setItem('cnine_player_client_id_v1552',clientId);}
   const response=await fetch('/api/war-chat/ticket',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+credential,'x-cnine-client-id':clientId,'x-cnine-sync-revision':window.CNineAccountSync?.revision||'0'},body:JSON.stringify({kind}),signal:abort.signal,cache:'no-store'}),data=await response.json();
   if(mine!==generation||!running())return;clearTimeout(timeout);abort=null;
   if(!response.ok){note(data.error||'채팅에 연결하지 못했습니다.');if(response.status>=500||response.status===429)retry();return;}
   if(room!==data.room){list.replaceChildren();sequence=0;room=data.room;pending=null;input.value='';}
   const url=new URL('/api/war-chat/stream',location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('room',data.room);url.searchParams.set('ticket',data.ticket);
   const ws=socket=new WebSocket(url);timeout=setTimeout(()=>ws.close(),10000);
   ws.onmessage=event=>{
    if(mine!==generation)return;if(credential!==token()){resetIdentity();void connect();return;}
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.serverNow)offset=msg.serverNow-Date.now();
    if(msg.type==='history'){
     clearTimeout(timeout);ready=true;attempt=0;you=msg.you;room=msg.room;list.replaceChildren();sequence=0;msg.messages.forEach(add);list.scrollTop=list.scrollHeight;
     const stored=read(key);if(stored?.room===room&&stored.you===you&&stored.sent>Date.now()+offset-300000)pending=stored;else save(key,null);
     note('연결됨 · 같은 편에게만 표시됩니다.');lock();if(pending){input.value=pending.body;transmit();}
     clearInterval(heartbeat);heartbeat=setInterval(()=>{if(credential!==token()){checkIdentity();return;}if(!pending&&ws.readyState===WebSocket.OPEN){ws.send('{"type":"ping"}');clearTimeout(timeout);timeout=setTimeout(()=>ws.close(),10000);}},25000);
    }else if(msg.type==='closed'){closed(msg.code);}
    else if(msg.type==='message')add(msg.message);
    else if(msg.type==='pong'){if(!pending)clearTimeout(timeout);}
    else if(msg.type==='ack'&&pending?.nonce===msg.nonce){clearTimeout(timeout);pending=null;save(key,null);input.value='';$('[data-chat-count]').textContent='0 / 300';note('연결됨 · 같은 편에게만 표시됩니다.');lock();input.focus({preventScroll:true});}
    else if(msg.ok===false){clearTimeout(timeout);note(msg.error||'전송하지 못했습니다.');if(msg.nonce===pending?.nonce){pending=null;save(key,null);lock();}}
   };
   ws.onerror=()=>{};
   ws.onclose=event=>{if(mine===generation)closed(event.code);};
  }catch(e){if(mine===generation&&running()){clearTimeout(timeout);retry();}}
 }
 function closed(code){
  disconnect();
  if([4001,4004,4005,1008].includes(code)){
   note(code===4005?'현재 이 채팅방은 OFF입니다.':code===4001?'다른 탭에서 연결했습니다. 이 창은 연결을 종료했습니다.':'소속 또는 계정 상태가 변경되었습니다. 다시 확인하세요.');
   if(code!==4001){list.replaceChildren();sequence=0;pending=null;save(key,null);}return;
  }
  retry();
 }
 let gameScroll=0;
 const scrollHost=workspace.closest('.tw3-overlay')||document.scrollingElement;
 function layout(){const visible=opened&&active;panel.hidden=!visible;host.hidden=!visible;workspace.classList.toggle('is-chat-open',visible);launch.classList.toggle('primary',visible);game.classList.toggle('primary',!visible);launch.setAttribute('aria-expanded',String(visible));game.setAttribute('aria-pressed',String(!visible));}
 function toggle(value){if(value===opened)return;if(value)gameScroll=scrollHost.scrollTop;opened=value;save('war-chat:open:'+kind,value);layout();if(value&&active){void connect();if(innerWidth<1280)workspace.scrollIntoView({block:'start'});}else{disconnect();requestAnimationFrame(()=>{scrollHost.scrollTop=gameScroll;launch.focus({preventScroll:true});});}}
 function visibility(){if(document.hidden)disconnect();else if(running())void connect();}
 function online(){if(running())void connect();}
 const dock={anchor,checkIdentity,activate(value){const changed=active!==value;active=value;layout();if(!value)disconnect();else if(changed&&opened)void connect();},destroy(){destroyed=true;disconnect();size.disconnect();anchor.classList.remove('war-chat-surface');if(workspace.isConnected)for(const child of [...workspace.children])if(child!==host&&!child.classList.contains('war-chat-nav'))workspace.before(child);workspace.remove();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);window.removeEventListener('online',online);window.removeEventListener('storage',checkIdentity);window.removeEventListener('cnine:player-updated',checkIdentity);}};
 function pagehide(){disconnect();}
 function pageshow(event){if(event.persisted)online();}
 launch.onclick=()=>toggle(true);game.onclick=()=>toggle(false);$('[data-chat-close]').onclick=()=>toggle(false);$('[data-chat-retry]').onclick=()=>{attempt=0;void connect();};
 input.oninput=()=>{$('[data-chat-count]').textContent=[...input.value].length+' / 300';};
 $('form').onsubmit=e=>{e.preventDefault();checkIdentity();if(!ready||pending)return;const body=chatText(input.value);if(!body){note('메시지는 1~300자로 입력하세요.');return;}pending={nonce:crypto.randomUUID(),sent:Math.floor(Date.now()+offset),body,room,you};save(key,pending);lock();transmit();};
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('form').requestSubmit();}});
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);window.addEventListener('online',online);window.addEventListener('storage',checkIdentity);window.addEventListener('cnine:player-updated',checkIdentity);
 lock();docks.set(kind,dock);selectDock();
}
