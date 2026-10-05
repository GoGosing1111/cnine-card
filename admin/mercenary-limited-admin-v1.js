import {validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs?v=20261002';
import {validateLimitedPack,limitedPackReadiness,LIMITED_EXTRA_REWARDS} from '../shared/mercenary-limited-pack-v1.mjs?v=20261006';
import {parseDrawPercent,formatDrawPercent} from '../shared/mercenary-draw-policy-v1.mjs?v=20260927-berkan-off';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null?'미정':Number(n).toLocaleString('ko-KR');
const field=(label,attrs,value)=>'<label class="mc-field"><span>'+label+'</span><input '+attrs+' value="'+(value??'')+'" placeholder="미정"></label>';
export function createLimitedMercenaryEditor({request,onRender}){
 let state=null,root=null,dirty=false,busy=false,pending=null,notice='',generation=0;
 const $=s=>root?.querySelector(s);
 const rateField=(label,attrs,n)=>field(label,attrs+' type="number" min="0" max="100" step="0.0001" inputmode="decimal"',n===null?'':formatDrawPercent(n));
 function html(){
  if(!state)return '<section data-limited-root class="mc-review"><p role="status">'+esc(notice||'리미티드 계약 설정을 불러오고 있습니다.')+'</p><button data-limited-reload '+(busy?'disabled':'')+'>다시 불러오기</button></section>';
  const s=state.packSettings,readiness=limitedPackReadiness(s,state.policy,state.stock);
  return '<section data-limited-root class="mc-review"><header class="mlc-hero"><div><small>LIMITED / MERCENARY CONTRACT</small><h3>서버 한정 계약</h3><p>용병별 발행 한도 · 전용 가격 · 독립 확률</p><b>출시 준비 · 개봉 OFF</b></div><img src="/assets/ui/packs/limited-v1/pack-640.webp" alt=""></header>'+
  '<div class="mc-release-strip"><p>설정을 저장해도 개봉·전투 편성은 열리지 않습니다. 이미 발행된 수량은 초기화하지 않습니다.</p><b>확률 r'+state.revision+' · 팩 r'+state.packRevision+'</b></div>'+
  '<section class="mc-fields-section"><div class="mc-section-title"><h3>개봉 가격</h3><p>10회 가격은 1회 가격과 별도로 설정합니다. 자동 진행에도 선택한 묶음 가격이 적용됩니다.</p></div><div class="mc-fields">'+
  ['single','ten'].map((k,i)=>field((i?'10회':'1회')+' · 코인','data-limited-price="'+k+'" type="number" min="1" max="100000000000000" step="1"',s.prices[k])).join('')+'</div></section>'+
  '<section class="mc-fields-section"><div class="mc-section-title"><h3>전체 보상 확률</h3><p>등급별 용병 · 재료 · 꽝의 합계가 100%여야 출시할 수 있습니다.</p></div><div class="mc-fields">'+
  ['SS','SSS'].map(rank=>rateField(rank+' 리미티드 · %','data-limited-rate="'+rank+'"',state.policy.rankRatesPpm[rank])).join('')+
  s.extraRewards.map(r=>'<div>'+rateField(LIMITED_EXTRA_REWARDS.find(m=>m.id===r.id).name+' · %','data-limited-extra-rate="'+r.id+'"',r.chancePpm)+(r.id==='NONE'?'':field('당첨 시 지급 개수','data-limited-extra-quantity="'+r.id+'" type="number" min="1" max="1000000000" step="1"',r.quantity))+'</div>').join('')+'</div><p data-limited-total>현재 합계 '+formatDrawPercent(readiness.totalPpm)+'%</p></section>'+
  '<div class="mc-section-title"><h3>용병별 발행 한도 · '+state.cards.length+'종</h3><p>가중치 0은 추첨 제외입니다. 동일 등급에서 잔여 수량이 있는 용병끼리 가중치로 추첨합니다. 해당 등급이 모두 소진되면 개봉을 멈춥니다.</p></div><div class="mlc-cards">'+
  state.cards.map(c=>{const stock=state.stock.find(r=>r.code===c.code);return '<article><img loading="lazy" src="/assets/ui/packs/limited-v1/'+c.code.toLowerCase()+'-640.webp" alt=""><div><small>'+esc(c.code)+' / '+esc(c.rank)+' LIMITED</small><h4>'+esc(c.name)+'</h4><p>발행 <b>'+fmt(stock.issued)+'</b> · 잔여 '+fmt(stock.remaining)+'</p><div class="mc-fields">'+field('서버 전체 발행 한도','data-limited-cap="'+c.code+'" type="number" min="'+stock.issued+'" max="1000000" step="1"',s.stockLimits[c.code])+field('등급 내 가중치','data-limited-weight="'+c.code+'" type="number" min="0" max="1000000" step="1"',state.policy.cardWeights[c.code])+'</div></div></article>';}).join('')+'</div>'+
  '<label class="mc-field"><span>운영 메모</span><textarea data-limited-notes maxlength="2000">'+esc(state.policy.notes)+'</textarea></label>'+
  '<label class="mc-field"><span>저장 사유 · 4자 이상</span><input data-limited-reason maxlength="500" value="'+esc(pending?.reason||'리미티드팩 운영 설정 준비')+'"></label>'+
  '<p role="status" aria-live="polite">'+esc(notice||'가격·확률·한도는 미정으로 저장할 수 있습니다.')+'</p>'+
  '<div class="mc-savebar"><span>설정 저장 · 출시 잠금 유지</span><div><button data-limited-reload '+(busy?'disabled':'')+'>다시 불러오기</button><button data-limited-save class="mc-primary" '+(busy||!dirty?'disabled':'')+'>'+(pending?'저장 결과 재확인':'설정 저장')+'</button></div></div></section>';
 }
 async function load(){
  if(busy)return;const token=generation;busy=true;notice='불러오는 중…';onRender();
  try{const next=await request();if(token!==generation)return;state=next;dirty=false;pending=null;notice='리미티드팩 설정을 불러왔습니다.';}catch(e){if(token===generation)notice=e.message;}
  finally{if(token===generation){busy=false;onRender();}}
 }
 async function save(){
  if(busy||!dirty)return;
  try{
   for(const input of root.querySelectorAll('input,textarea'))if(!input.reportValidity())return;
   validateLimitedPolicy(state.policy);validateLimitedPack(state.packSettings);
   pending??={expectedRevision:state.revision,expectedPackRevision:state.packRevision,policy:structuredClone(state.policy),packSettings:structuredClone(state.packSettings),requestId:crypto.randomUUID(),reason:$('[data-limited-reason]').value.trim()};
   if(pending.reason.length<4)throw Error('저장 사유를 4자 이상 입력하세요.');
  }catch(e){notice=e.message;onRender();return;}
  const token=generation;busy=true;onRender();
  try{const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(token!==generation)return;state=next;dirty=false;pending=null;notice='리미티드팩 저장 완료 · 획득 잠금 유지';}
  catch(e){if(token===generation){notice=e.message;if(e.status>=400&&e.status<500)pending=null;}}
  finally{if(token===generation){busy=false;onRender();}}
 }
 function mount(element){
  root=element;if(!root)return;
  $('[data-limited-reload]')?.addEventListener('click',()=>void load());$('[data-limited-save]')?.addEventListener('click',()=>void save());
  root.querySelectorAll('input,textarea').forEach(input=>{
   input.disabled=busy;
   input.oninput=()=>{
    if(!state)return;const d=input.dataset,n=input.value===''?null:Number(input.value),percent=()=>input.value===''?null:(parseDrawPercent(input.value)??NaN);
    if(d.limitedRate)state.policy.rankRatesPpm[d.limitedRate]=percent();
    else if(d.limitedWeight)state.policy.cardWeights[d.limitedWeight]=n??NaN;
    else if(d.limitedPrice)state.packSettings.prices[d.limitedPrice]=n;
    else if(d.limitedCap)state.packSettings.stockLimits[d.limitedCap]=n;
    else if(d.limitedExtraRate)state.packSettings.extraRewards.find(r=>r.id===d.limitedExtraRate).chancePpm=percent();
    else if(d.limitedExtraQuantity)state.packSettings.extraRewards.find(r=>r.id===d.limitedExtraQuantity).quantity=n;
    else if(input.hasAttribute('data-limited-notes'))state.policy.notes=input.value;
    dirty=true;pending=null;const button=$('[data-limited-save]');button.disabled=busy;button.textContent='설정 저장';
    $('[data-limited-total]').textContent='현재 합계 '+formatDrawPercent(limitedPackReadiness(state.packSettings,state.policy,state.stock).totalPpm)+'%';
   };
  });
  if(!state&&!busy&&!notice)void load();
 }
 return {html,mount,reset(){generation++;state=null;root=null;dirty=false;busy=false;pending=null;notice='';}};
}
