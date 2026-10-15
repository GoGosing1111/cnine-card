import {ICON_TECHNIQUES,emptyIconTechniqueTuning,validateIconTechniques} from '../shared/icon-techniques-v1.mjs';
import {mercenaryCmsRequest} from './mercenary-request-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountIconTechniqueEditor(root,{request=options=>mercenaryCmsRequest(options,'/api/admin/icon-techniques')}={}){
 let state=null,draft=null,selected=ICON_TECHNIQUES[0].code,busy=false,dirty=false,pending=null,disposed=false;
 const row=()=>draft?.techniques.find(item=>item.code===selected);
 const say=text=>{const output=root.querySelector('[data-it-status]');if(output)output.textContent=text;};
 function controls(){
  root.querySelectorAll('button,input,textarea').forEach(el=>{el.disabled=busy||!state&&!el.matches('[data-it-reload]')||Boolean(pending)&&el.matches('input,textarea');});
  const save=root.querySelector('[data-it-save]');
  if(save){save.disabled=busy||!state||(!dirty&&!pending);save.textContent=pending?'저장 결과 재확인':'기술 준비 초안 저장';}
 }
 function draw(){
  if(disposed)return;
  const def=ICON_TECHNIQUES.find(item=>item.code===selected),value=row();
  root.innerHTML='<section class="it-studio" aria-label="신규 ICON 기술 준비">'+
   '<header class="it-heading"><div><p class="ic-eyebrow">ICON / TECHNIQUE PREPARATION</p><h3>신규 기술 8종 <span>준비실</span></h3><p>기술 효과를 검토하고 수치 초안을 기록합니다. 카드 8장은 추후 별도로 제작합니다.</p></div><strong class="it-lock">전체 OFF<small>카드 미배정 8 / 8</small></strong></header>'+
   '<p class="it-notice">저장해도 실전에 활성화되지 않습니다. 기존 ICON 9종은 현재 설정을 유지합니다. 빈 수치는 미승인 상태이며 입력 범위는 검증 한도입니다.</p>'+
   '<nav class="it-roster" aria-label="신규 기술 선택">'+ICON_TECHNIQUES.map((item,index)=>'<button type="button" data-it-select="'+item.code+'" aria-pressed="'+(item.code===selected)+'"><small>'+String(index+1).padStart(2,'0')+'</small><span>'+esc(item.name)+'</span><em>미배정 · OFF</em></button>').join('')+'</nav>'+
   '<div class="it-detail"><header><div><small>'+def.code+'</small><h4>'+esc(def.name)+'</h4></div><span class="it-revision">초안 V'+(state?.revision??'—')+'</span></header>'+
   '<p class="it-preview"><a href="/preview/icon-techniques-20261015/?code='+def.code+'" target="_blank" rel="noopener">V3 연출 검수 ↗</a><span>카드 미배정 · 대역·고정 수치 프리뷰</span></p>'+ '<p class="it-summary">'+esc(def.summary)+'</p><dl class="it-facts"><div><dt>적용 대상</dt><dd>'+esc(def.target)+'</dd></div><div><dt>발동·처리 시점</dt><dd>'+esc(def.timing)+'</dd></div><div><dt>카드 연결</dt><dd>미배정 · 새 카드 생성 후 별도 승인</dd></div><div><dt>운영 상태</dt><dd>OFF 고정 · 이 화면에서 개방 불가</dd></div></dl>'+
   '<section class="it-safety"><h5>효과 경계와 보호 조건</h5><ul>'+def.safety.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></section>'+
   '<div class="ic-section-title"><h4>수치 준비 초안</h4><span>빈칸 = null · 운영 승인 아님</span></div>'+
   '<div class="it-fields">'+def.fields.map(field=>'<label><span>'+esc(field.label)+'</span><div><input type="number" inputmode="'+(field.integer?'numeric':'decimal')+'" step="'+(field.integer?'1':'any')+'" min="'+field.min+'" max="'+field.max+'" data-it-field="'+field.key+'" aria-label="'+esc(def.name+' '+field.label)+'" placeholder="미승인" value="'+(value?.tuning?.[field.key]??'')+'"><small>'+esc(field.unit)+'</small></div><em>입력 범위 '+field.min+'–'+field.max+'</em></label>').join('')+'</div>'+
   '<label class="it-notes">검토 메모<textarea data-it-notes maxlength="1200" rows="3" placeholder="효과·수치 검토 의견을 기록하세요.">'+esc(value?.notes??'')+'</textarea></label></div>'+
   '<footer class="it-footer"><p data-it-status role="status" aria-live="polite">'+(dirty?'저장하지 않은 준비 초안이 있습니다.':state?'준비 초안만 저장됩니다. 8종 모두 미배정 · OFF입니다.':'기술 준비 초안을 불러오는 중…')+'</p><div><button type="button" data-it-export>편집본 내려받기</button><button type="button" data-it-reload>다시 불러오기</button><button type="button" class="ic-primary" data-it-save>기술 준비 초안 저장</button></div></footer></section>';
  controls();
 }
 async function load(){
  if(busy||disposed)return;busy=true;controls();
  try{const next=await request();if(disposed)return;const checked=validateIconTechniques(next.document);state=next;draft=checked;dirty=false;pending=null;draw();say('초안 버전 '+next.revision+' · 8종 모두 카드 미배정 · OFF');}
  catch(error){say(error.message);}
  finally{busy=false;if(!disposed)controls();}
 }
 async function save(){
  if(busy||!state||disposed)return;
  if(!pending){
   if(![...root.querySelectorAll('input[type=number]')].every(el=>el.reportValidity()))return;
   try{pending={requestId:crypto.randomUUID(),expectedRevision:state.revision,document:validateIconTechniques(draft)};}catch(error){say(error.message);return;}
  }
  busy=true;controls();say('준비 초안을 저장하고 있습니다. 운영 상태는 OFF로 유지됩니다.');
  try{
   const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;
   const checked=validateIconTechniques(next.document);state=next;draft=checked;pending=null;dirty=false;draw();
   say('초안 저장 완료 · 버전 '+next.revision+' · 카드 미배정 · OFF 유지');
  }catch(error){
   if(disposed)return;
   if(error.status>=400&&error.status<500)pending=null;
   say(error.message+(pending?' 편집을 보존했습니다. 같은 요청으로 저장 결과를 재확인할 수 있습니다.':''));
  }finally{busy=false;if(!disposed)controls();}
 }
 const input=event=>{
  if(busy||pending||!row())return;const el=event.target;
  if(el.matches('[data-it-field]')){
   const tuning=row().tuning||emptyIconTechniqueTuning(selected);tuning[el.dataset.itField]=el.value===''?null:Number(el.value);
   row().tuning=Object.values(tuning).every(value=>value===null)?null:tuning;
  }else if(el.matches('[data-it-notes]'))row().notes=el.value;else return;
  dirty=true;say('저장하지 않은 준비 초안이 있습니다. 저장해도 실전에 반영되지 않습니다.');controls();
 };
 const click=event=>{
  if(busy||disposed)return;const choice=event.target.closest('[data-it-select]');
  if(choice){selected=choice.dataset.itSelect;draw();}
  if(event.target.closest('[data-it-save]'))void save();
  if(event.target.closest('[data-it-reload]')){if((dirty||pending)&&!confirm('저장하지 않은 준비 초안을 버리고 다시 불러올까요?'))return;void load();}
  if(event.target.closest('[data-it-export]')&&draft){
   const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'})),link=document.createElement('a');
   link.href=url;link.download='icon-techniques-preparation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
 };
 root.addEventListener('input',input);root.addEventListener('click',click);draw();void load();
 return{dispose(){disposed=true;root.removeEventListener('input',input);root.removeEventListener('click',click);root.replaceChildren();}};
}
