import {jointAccountRequest as api} from '../js/joint-account-transport.mjs';
import {MINE_DRILLS,MINE_DURATION_MS} from '../shared/master-star-mine-v1.mjs';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('ko-KR'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,selected=MINE_DRILLS[0].code,busy=false,loading=false,pending=null,clockBase=0,clockStarted=0,failed=false,auth=false,toastTimer,readyRefresh='';
const serverNow=()=>clockBase+performance.now()-clockStarted;
const storeKey=()=>state?'master-star-mine-pending:'+state.accountId:null;
function readPending(){try{const p=JSON.parse(localStorage.getItem(storeKey())||'null');return p&&['start','claim'].includes(p.action)&&typeof p.body?.requestId==='string'?p:null;}catch{return null;}}
function savePending(value){pending=value;try{const key=storeKey();if(key)value?localStorage.setItem(key,JSON.stringify(value)):localStorage.removeItem(key);}catch{}}
function notice(title,message,error=false){$('mineMode').textContent=title;$('mineMessage').textContent=message;$('mineNotice').dataset.error=String(error);}
function toast(message){$('mineFeedback').textContent=message;$('mineFeedback').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('mineFeedback').hidden=true,6500);}
const drills=()=>state?.drills||MINE_DRILLS.map(d=>({...d,owned:false,reward:null}));
function render(){
 const run=state?.run,rows=drills();if(run)selected=run.drillCode;
 const chosen=rows.find(d=>d.code===selected)||rows[0];$('mineBalance').textContent=state?fmt(state.balance):'—';
 $('stageDrill').src=chosen.image;$('stageDrill').alt=chosen.name;$('stageDrillLabel').textContent=chosen.label;$('stageDrillName').textContent=chosen.name;
 const reward=run?run.reward:chosen.reward;$('mineReward').textContent=reward===null?'—':fmt(reward);
 $('mineAcquisition').textContent=state?.acquisitionNotice||'로그인 후 드릴 획득 안내와 보유 현황을 확인하세요.';
 $('mineDrills').innerHTML=rows.map(d=>'<button type="button" class="drill-card" data-id="'+d.id+'" data-drill="'+d.code+'" aria-pressed="'+(selected===d.code)+'" '+(run||busy||pending?'disabled':'')+' aria-label="'+esc(d.name)+' · '+(d.reward===null?'보상 확인 전':fmt(d.reward)+'개')+' · '+(d.owned?'보유':'미보유')+'"><img src="'+d.image+'" alt=""><span class="drill-label">'+d.label+'</span><h3>'+d.name+'</h3><span class="drill-reward">'+(d.reward===null?'—':fmt(d.reward))+'<small>개 / 4시간</small></span><span class="drill-owned" data-owned="'+d.owned+'">'+(d.owned?'보유 중':'미보유')+'</span></button>').join('');
 $('mineHistory').innerHTML=state?.history.length?state.history.map(r=>{const d=MINE_DRILLS.find(i=>i.code===r.drillCode),date=new Date(r.claimedAt);return '<div class="mine-history-row"><img src="'+d.image+'" alt=""><b>'+d.name+'</b><time datetime="'+date.toISOString()+'">'+date.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+'</time><strong>+'+fmt(r.reward)+'</strong><span>수령 완료</span></div>';}).join(''):'<p>'+(state?'완료한 채굴 기록이 없습니다. 첫 채굴을 시작해 보세요.':'로그인 후 내 채굴 기록을 확인하세요.')+'</p>';
 $('mineLogin').hidden=!auth;$('mineAction').hidden=auth;tick();
}
function tick(){
 const run=state?.run,now=state?serverNow():0,left=run?Math.max(0,run.readyAt-now):MINE_DURATION_MS,ready=Boolean(run&&left<=0),seconds=Math.ceil(left/1000),chosen=drills().find(d=>d.code===selected);
 $('mineTimer').textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 const progress=run?Math.min(100,Math.max(0,(now-run.startedAt)/MINE_DURATION_MS*100)):0;$('mineProgress').firstElementChild.style.width=progress+'%';$('mineProgress').setAttribute('aria-valuenow',String(Math.round(progress)));
 $('mineStage').dataset.status=ready?'READY':run?'MINING':'IDLE';
 $('stageStatus').textContent=ready?'채굴 완료':run?'채굴 중':'작업 대기';
 $('mineJobBadge').textContent=ready?'수령 가능':run?'작업 중':'준비';
 $('controlTitle').textContent=ready?'별을 수확할 시간':run?'별빛을 채굴하는 중':'채굴 준비';
 $('mineControlDescription').textContent=ready?'채굴을 완료했습니다. 보상을 수령하세요.':run?'선택한 드릴이 광맥을 채굴하고 있습니다.':'보유한 드릴을 선택해 채굴을 시작하세요.';
 $('mineTimeLabel').textContent=ready?'채굴 완료':run?'완료까지 남은 시간':'채굴 소요 시간';
 $('mineTimeHint').textContent=ready?'보상을 수령하면 다음 채굴을 시작할 수 있습니다.':run?'완료 예정 · '+new Date(run.readyAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'접속하지 않아도 채굴은 계속됩니다.';
 const button=$('mineAction');button.disabled=busy||loading||!navigator.onLine||(!pending&&(failed||!state||(!ready&&(!!run||!state.enabled||!chosen.owned||!chosen.reward))));
 button.textContent=busy?'처리 중…':pending?'처리 결과 다시 확인':failed?'정보를 새로고침하세요':ready?'보상 수령하기  +'+fmt(run.reward):run?'채굴 진행 중':!state?'정보 확인 중':!state.enabled?'광산 개장 준비 중':!chosen.owned?'드릴이 필요합니다':'4시간 채굴 시작  →';
 $('mineActionNote').textContent=pending?'이전 요청의 처리 결과를 확인합니다.':run?'시작할 때 확정된 보상이 그대로 지급됩니다.':'드릴은 사용해도 사라지지 않습니다.';
 if(ready&&run.status==='MINING'&&readyRefresh!==run.id&&!busy&&!loading){readyRefresh=run.id;void load();}
}
async function load(){
 if(loading||busy)return;loading=true;tick();
 try{
  const next=await api('master-star-mine/state');state=next;clockBase=next.serverNow;clockStarted=performance.now();failed=false;auth=false;pending=readPending();
  if(!next.run&&!next.drills.some(d=>d.code===selected&&d.owned))selected=next.drills.find(d=>d.owned)?.code||selected;
  notice(next.enabled?'채굴 가능':'개장 준비 중',next.enabled?'드릴을 선택해 광맥을 채굴하세요.':next.acquisitionNotice);
  window.dispatchEvent(new CustomEvent('cnine:player-updated',{detail:{masterStars:next.balance}}));
 }catch(error){failed=true;auth=error.status===401;if(auth){state=null;pending=null;}notice(auth?'로그인 필요':'연결 확인',auth?'로그인하면 보유 드릴과 채굴 상태를 확인할 수 있습니다.':error.message,true);}
 finally{loading=false;render();}
}
$('mineDrills').addEventListener('click',event=>{const button=event.target.closest('[data-drill]');if(!button||button.disabled||state?.run||busy||pending)return;selected=button.dataset.drill;render();});
$('mineRefresh').addEventListener('click',()=>void load());
$('mineAction').addEventListener('click',async()=>{
 if(busy||loading||!state||$('mineAction').disabled)return;
 if(!pending){const action=state.run?'claim':'start';savePending({action,body:{requestId:crypto.randomUUID(),...(action==='claim'?{runId:state.run.id}:{drillCode:selected})}});}
 const request=pending;busy=true;render();
 try{
  const result=await api('master-star-mine/'+request.action,{method:'POST',body:request.body});savePending(null);state=result;clockBase=result.serverNow;clockStarted=performance.now();failed=false;readyRefresh='';
  if(result.claimed)toast('마스터의 별 '+fmt(result.claimed.reward)+'개 수령 완료');else toast('채굴을 시작했습니다. 4시간 뒤 보상을 수령하세요.');
  notice(result.enabled?'채굴 가능':'개장 준비 중',result.run?'채굴 중에는 드릴을 변경할 수 없습니다.':result.acquisitionNotice);
 }catch(error){
  if(error.retryable===false||error.status&&error.status<500&&![408,429].includes(error.status))savePending(null);
  notice('처리 확인',error.message,true);
 }finally{busy=false;render();if(!pending)void load();}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
window.addEventListener('online',()=>void load());window.addEventListener('offline',()=>{failed=true;notice('연결 끊김','연결이 복구되면 채굴 상태를 다시 확인합니다.',true);tick();});
window.addEventListener('storage',event=>{if(['cnine_card_api_token','cnine_card_user_v10'].includes(event.key))void load();});
setInterval(()=>{if(!document.hidden)tick();},1000);setInterval(()=>{if(!document.hidden)void load();},60000);render();void load();
