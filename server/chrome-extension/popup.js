const send=m=>new Promise(r=>chrome.runtime.sendMessage(m,x=>r(x||{})));
async function refresh(){await send({type:'CNINE_SYNC_AUTH'});const s=await send({type:'CNINE_STATUS'});status.textContent=s.connected?'관리자 인증 연결됨':'관리자 인증 필요';status.className=s.connected?'ok':'no';detail.textContent=s.connected?`저장 시각: ${s.adminTokenSavedAt||'-'}\n와고 닉네임 클릭 시 지급창이 열립니다.`:'CMS에 OWNER/ADMIN 계정으로 로그인한 뒤 이 창을 다시 여세요.';}
connect.onclick=()=>chrome.tabs.create({url:'https://cnine-card.pages.dev/admin/'});
wago.onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.url?.includes('ygosu.com'))window.close();else chrome.tabs.create({url:'https://ygosu.com/board/soop'});};
logout.onclick=async()=>{await send({type:'CNINE_LOGOUT'});refresh();};refresh();
