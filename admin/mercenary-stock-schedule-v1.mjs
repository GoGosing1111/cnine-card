import {stockScheduleDate,stockScheduleKstToIso} from '../shared/mercenary-stock-schedule-v1.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createStockScheduleEditor({request,onRender,onState,canEdit=()=>true}){
 let state=null,date='',reason='',quantities={},busy=false,pending=null,notice='',generation=0;
 const changes=()=>Object.entries(quantities).filter(([,quantity])=>quantity>0).map(([code,quantity])=>({code,quantity}));
 function html(next,locked=false){
  state=next;if(!state)return '';
  const cards=state.cards.filter(c=>c.stockPolicy!=='UNLIMITED'),history=state.stockScheduleHistory??[],disabled=busy||locked||Boolean(pending),names=Object.fromEntries(cards.map(c=>[c.code,c.name]));
  return '<section data-stock-schedule class="cn-command-ui stock-schedule"><div class="cn-ui-panel"><h3>한정 수량 예약</h3><p>한국시간(KST)에 추가 수량을 한 번 반영합니다. 예약 당시 한도를 고정하지 않고 실행 시점의 한도에 더합니다.</p>'+
   '<p>서버 시각 · '+esc(stockScheduleDate(state.serverNow||new Date().toISOString()))+(locked?' · 먼저 변경한 팩 설정을 저장하거나 다시 불러오세요.':'')+'</p>'+
   '<div class="stock-schedule-fields"><label class="mc-field"><span>예약 날짜 · 시간 (한국시간)</span><input data-stock-date type="datetime-local" step="1" value="'+esc(date)+'" '+(disabled?'disabled':'')+'></label><label class="mc-field"><span>예약 사유 · 4자 이상</span><input data-stock-reason maxlength="500" value="'+esc(reason)+'" '+(disabled?'disabled':'')+'></label></div>'+
   '<div class="stock-schedule-cards">'+cards.map(c=>'<label class="stock-schedule-card"><img src="/'+esc(c.thumbnailArt||c.sourceArt)+'" alt=""><span>'+esc(c.name)+'<small>현재 한도 '+esc(state.stock.find(s=>s.code===c.code)?.limit)+'장</small></span><span class="stock-schedule-quantity"><input aria-label="'+esc(c.name)+' 추가 수량" data-stock-code="'+c.code+'" type="number" min="0" max="10000" step="1" value="'+(quantities[c.code]??0)+'" '+(disabled?'disabled':'')+'>장</span></label>').join('')+'</div>'+
   '<p data-stock-summary>추가할 용병의 수량을 입력하세요. 0장은 예약에서 제외됩니다.</p><p role="status" aria-live="polite">'+esc(notice)+'</p><button data-stock-create class="cn-ui-button primary" '+(busy||locked?'disabled':'')+'>'+(busy?'처리 중…':pending?'같은 예약 결과 다시 확인':'수량 증가 예약')+'</button></div>'+
   '<div class="cn-ui-panel stock-schedule-history"><h4>예약 · 처리 내역</h4>'+(history.length?history.slice().sort((a,b)=>b.executeAt.localeCompare(a.executeAt)).map(s=>'<article><div><b>'+esc(stockScheduleDate(s.executeAt))+'</b><strong>'+({SCHEDULED:Date.parse(s.executeAt)<=Date.parse(state.serverNow)?'처리 대기':'예약됨',APPLIED:'증가 완료',CANCELLED:'취소됨'}[s.status]||esc(s.status))+'</strong></div><p>'+s.changes.map(c=>esc(names[c.code]||c.code)+' +'+c.quantity+'장').join(' · ')+'</p><small>'+esc(s.reason)+'</small>'+(s.status==='SCHEDULED'?'<button class="cn-ui-button" data-stock-cancel="'+esc(s.id)+'" '+(busy||locked?'disabled':'')+'>예약 취소</button>':'')+'</article>').join(''):'<p>등록된 예약이 없습니다.</p>')+'<p>최근 처리 내역 50건과 모든 대기 예약을 표시합니다.</p></div></section>';
 }
 async function send(body){
  if(!canEdit()){notice='먼저 변경한 팩 설정을 저장하거나 다시 불러오세요.';onRender();return;}
  const token=generation;busy=true;pending??=body;notice='예약 처리 중…';onRender();
  try{const next=await request({method:'POST',body:JSON.stringify(pending)});if(token!==generation)return;const action=pending.action;pending=null;date='';reason='';quantities={};notice=action==='CANCEL_STOCK'?'예약을 취소했습니다.':'예약을 등록했습니다. 실행 시각 전에는 수량이 증가하지 않습니다.';onState(next);}
  catch(error){if(token!==generation)return;notice=error.message;if(error.status>=400&&error.status<500)pending=null;}
  finally{if(token===generation){busy=false;onRender();}}
 }
 function mount(root){
  if(!root)return;
  for(const href of ['/css/command-ui-v1.css?v=20261024-approved','/admin/mercenary-stock-schedule-v1.css?v=20261026-v1'])if(!document.querySelector('link[href="'+href+'"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
  const summary=()=>{root.querySelector('[data-stock-summary]').textContent=changes().length?'선택 '+changes().length+'종 · 총 '+changes().reduce((sum,c)=>sum+c.quantity,0)+'장 추가 예정':'추가할 용병의 수량을 입력하세요. 0장은 예약에서 제외됩니다.';};
  root.querySelector('[data-stock-date]').oninput=e=>{date=e.target.value;};root.querySelector('[data-stock-reason]').oninput=e=>{reason=e.target.value;};
  root.querySelectorAll('[data-stock-code]').forEach(input=>input.oninput=()=>{quantities[input.dataset.stockCode]=input.value===''?0:Number(input.value);summary();});summary();
  root.querySelector('[data-stock-create]').onclick=()=>{
   if(busy)return;if(pending){void send(pending);return;}
   try{for(const input of root.querySelectorAll('input'))if(!input.reportValidity())return;const executeAt=stockScheduleKstToIso(date);if(!changes().length)throw Error('추가할 수량을 1장 이상 입력하세요.');if(reason.trim().length<4)throw Error('예약 사유를 4자 이상 입력하세요.');void send({action:'SCHEDULE_STOCK',requestId:crypto.randomUUID(),executeAt,changes:changes(),reason:reason.trim()});}catch(error){notice=error.message;onRender();}
  };
  root.querySelectorAll('[data-stock-cancel]').forEach(button=>button.onclick=()=>{if(!busy)void send({action:'CANCEL_STOCK',requestId:crypto.randomUUID(),scheduleId:button.dataset.stockCancel,reason:'OWNER 예약 취소'});});
 }
 return {html,mount,get busy(){return busy;},get dirty(){return Boolean(date||reason||changes().length||pending);},reset(){generation++;state=null;date='';reason='';quantities={};busy=false;pending=null;notice='';}};
}
