import {mountUserAuction,createAuctionOpeningNotice} from '../../js/auction-user-v1.mjs';
const root=document.getElementById('auction-preview-root');let userId=2,inLobby=false,screen=null;
async function api(action,body){const response=await fetch('/__auction-preview/'+action,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-preview-user':String(userId)},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}
const notice=createAuctionOpeningNotice({api,getContext:()=>({userId,inLobby}),onEnter:showAuction});
function showAuction(){inLobby=false;screen?.destroy();notice.update({active:null});screen=mountUserAuction({root,api,onLobby:showLobby});}
async function showLobby(){inLobby=true;screen?.destroy();screen=null;root.className='review-lobby';root.innerHTML='<img src="/assets/ui/tactical-20261030/auction.webp" alt="경매장"><p>REVERSE CALL / LOBBY</p><h1>새 경매를 만나보세요</h1><p>새 경매가 시작되면 로비에서 한 번 알려드립니다.<br>예약 중인 경매는 실제로 시작될 때 안내합니다.</p><button class="auc-button" id="review-enter">경매장 입장 →</button><p class="review-hint">알림 검토용 로비 화면입니다. 닫기·재입장·새로고침 시 같은 경매 알림은 반복되지 않습니다.<br>모든 수량과 거래는 격리된 가상 계정 데이터입니다.</p>';root.querySelector('#review-enter').onclick=showAuction;await notice.update(await api('state'));}
document.getElementById('review-account').onclick=()=>{userId=userId===2?1:2;document.getElementById('review-account').textContent=(userId===2?'푸른지휘관':'별빛상인')+' · 계정 전환';showAuction();};
setInterval(async()=>{if(inLobby&&!document.hidden)try{await notice.update(await api('state'));}catch{}},10000);
showAuction();
