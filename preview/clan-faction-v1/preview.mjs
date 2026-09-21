import {connect} from '/js/clan-faction-v1.mjs?v=20260922-sessions-prep';
async function boot(){
if(!['127.0.0.1','localhost'].includes(location.hostname)){document.querySelector('#review-mount').textContent='로컬 전용 검수 화면입니다. 게임의 클랜 본부에서 세력전을 이용하세요.';return;}
await customElements.whenDefined('soop-adventure-lobby');
const userId=Number(new URLSearchParams(location.search).get('as'))||1;
const user={id:userId,serverUserId:userId,nickname:userId===1?'DK 지휘관':`검수 부대원 ${userId}`,coin:2400000000,cardShards:284000,masterStars:13400,pigCoin:0};
const apiRequest=async(path,options={})=>{const res=await fetch('/api/'+path,{...options,headers:{...options.headers,'x-review-user':String(userId)}}),data=await res.json();if(!res.ok)throw Error(data.error||'검수 서버 연결 실패');return data;};
const renderShell=()=>{document.getElementById('review-mount').innerHTML=window.ClanV1.view();window.ClanV1.bind(ctx);};
const ctx={userId,apiRequest,renderShell,clearApiCache(){},async playFactionBattle(data){
  const layer=document.createElement('div');layer.className='review-battle-result';layer.innerHTML=`<section><small>로컬 서버 V3 계산 완료</small><h2>공유 HP −${data.damage.toLocaleString()}</h2><p>실제 V3 전투 엔진의 5장 덱 결과를 계산했습니다.<br>이 독립 화면에서는 세력전 작전 흐름을 검수합니다.</p><button>전황으로 복귀</button></section>`;
  document.body.append(layer);await new Promise(resolve=>layer.querySelector('button').onclick=()=>{layer.remove();resolve();});
}};
const shell=document.createElement('soop-adventure-lobby');shell.dataset.sharedNavigation='';shell.dataset.route='clan';
shell.navigationOptions={getUser:()=>user,navigate:route=>{if(route==='clan')renderShell();else shell.openMenu('clan');},isRouteVisible:()=>true,openChief(){},openAccount(){}};
document.querySelector('.review-app').append(shell);shell.update({user});
window.ClanV1.state.tab='faction';connect(ctx);renderShell();
document.getElementById('review-invasion').onclick=async()=>{await apiRequest('preview/invasion',{method:'POST'});};

}
void boot();
