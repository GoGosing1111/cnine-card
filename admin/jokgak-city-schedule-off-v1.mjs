import {jointAdminRequest} from '../js/joint-account-transport.mjs';
import {parseSeoulDateTimeInput,seoulDateTimeInput,formatCityOffTime} from '../shared/jokgak-city-schedule-off-v1.mjs';

export function mountCityOffSchedule(root,{request=jointAdminRequest,onCompleted=()=>{}}={}){
 let state=null,busy=false,destroyed=false,retry=null;
 const controller=new AbortController();
 root.innerHTML=`<section class="city-cms-off-schedule" aria-labelledby="city-off-title">
  <header><div><small>SERVER SCHEDULE · KST</small><h3 id="city-off-title">예약 OFF</h3></div><span data-off-badge>불러오는 중</span></header>
  <p data-off-summary>예약 정보를 확인하고 있습니다.</p>
  <form data-off-form><label for="city-off-at">종료 일시 <small>한국시간 · 낮 12시 = 12:00 / 밤 12시 = 00:00</small></label>
   <div class="city-cms-off-controls"><input id="city-off-at" name="offAt" type="datetime-local" step="60" required aria-describedby="city-off-help"><button type="submit" data-off-save disabled>예약 저장</button><button type="button" data-off-cancel disabled>예약 취소</button><button type="button" data-off-reload>새로고침</button></div>
  </form><p id="city-off-help" class="city-cms-off-help">브라우저를 닫아도 서버가 실행합니다. 종료된 회차를 먼저 정산하며, 진행 중 회차의 미정산 보상은 중지됩니다. 회차 정산 후 종료하려면 00·06·12·18시를 선택하세요.</p>
  <p data-off-result></p><p data-off-feedback role="status" aria-live="polite"></p>
 </section>`;
 const form=root.querySelector('form'),input=root.querySelector('input'),save=root.querySelector('[data-off-save]'),cancel=root.querySelector('[data-off-cancel]'),reload=root.querySelector('[data-off-reload]'),feedback=root.querySelector('[data-off-feedback]');
 const notice=(text,error=false)=>{feedback.textContent=text;feedback.classList.toggle('is-error',error);};
 const lock=value=>{busy=value;input.disabled=value||!state;save.disabled=value||!state;cancel.disabled=value||!state?.pending;reload.disabled=value;};
 function draw(data){
  state=data;retry=null;
  root.querySelector('[data-off-badge]').textContent=data.pending?'예약 대기':'예약 없음';
  root.querySelector('[data-off-badge]').classList.toggle('is-pending',!!data.pending);
  root.querySelector('[data-off-summary]').textContent=data.pending?formatCityOffTime(data.pending.offAt)+'에 족각도시를 OFF로 전환합니다.':'저장된 종료 예약이 없습니다.';
  input.value=data.pending?seoulDateTimeInput(data.pending.offAt):'';
  input.min=seoulDateTimeInput(Math.floor(data.serverNow/60000)*60000+60000);
  save.textContent=data.pending?'예약 변경':'예약 저장';
  root.querySelector('[data-off-result]').textContent=data.lastRun?'최근 실행 · '+formatCityOffTime(data.lastRun.completedAt)+' · '+(data.lastRun.outcome==='ALREADY_OFF'?'이미 OFF 상태로 완료':'OFF 전환 완료'):'';
 }
 async function load(){
  if(busy||destroyed)return;lock(true);
  try{const data=await request('admin/jokgak-city/schedule-off',{signal:controller.signal});if(destroyed)return;draw(data);notice('예약은 운영 설정과 별도로 저장됩니다.');}
  catch(error){if(!destroyed)notice(error.message,true);}finally{if(!destroyed)lock(false);}
 }
 async function write(offAt){
  if(busy||!state||destroyed)return;lock(true);notice(offAt===null?'예약을 취소하고 있습니다.':'종료 예약을 저장하고 있습니다.');
  // Keep the exact request on a lost response so a retry cannot create a second schedule.
  if(!retry||retry.offAt!==offAt)retry={revision:state.revision,offAt,requestId:crypto.randomUUID()};
  try{const data=await request('admin/jokgak-city/schedule-off',{method:'PATCH',body:retry,signal:controller.signal});if(destroyed)return;draw(data);notice(data.pending?'예약 저장 완료 · '+formatCityOffTime(data.pending.offAt):'예약이 취소되었습니다.');if(data.lastRun)onCompleted();}
  catch(error){if(!destroyed){if(error.status===409){retry=null;notice(error.message+' 새로고침 후 다시 저장하세요.',true);}else notice(error.message+' 저장을 다시 누르면 같은 요청으로 확인합니다.',true);}}
  finally{if(!destroyed)lock(false);}
 }
 form.addEventListener('submit',event=>{event.preventDefault();let at;try{at=parseSeoulDateTimeInput(input.value);}catch(error){notice(error.message,true);return;}void write(at);});
 cancel.addEventListener('click',()=>void write(null));reload.addEventListener('click',()=>void load());
 void load();return ()=>{destroyed=true;controller.abort();root.replaceChildren();};
}
