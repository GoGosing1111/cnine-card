import {validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs?v=20261002';
import {validateLimitedPack,limitedPackReadiness,LIMITED_EXTRA_REWARDS,LIMITED_NORMAL_RANKS} from '../shared/mercenary-limited-pack-v1.mjs?v=20261010-on';
import {parseDrawPercent,formatDrawPercent} from '../shared/mercenary-draw-policy-v1.mjs?v=20260927-berkan-off';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null?'미정':Number(n).toLocaleString('ko-KR');
const field=(label,attrs,value)=>'<label class="mc-field"><span>'+label+'</span><input '+attrs+' value="'+(value??'')+'" placeholder="미정"></label>';
export function createLimitedMercenaryEditor({request,onRender}){
 let state=null,root=null,dirty=false,busy=false,pending=null,notice='',generation=0,savedMode='OFF';
 const $=s=>root?.querySelector(s);
 const rateField=(label,attrs,n)=>field(label,attrs+' type="number" min="0" max="100" step="0.0001" inputmode="decimal"',n===null?'':formatDrawPercent(n));
 function html(){
  if(!state)return '<section data-limited-root class="mc-review"><p role="status">'+esc(notice||'리미티드 계약 설정을 불러오고 있습니다.')+'</p><button data-limited-reload '+(busy?'disabled':'')+'>다시 불러오기</button></section>';
  const s=state.packSettings,readiness=limitedPackReadiness(s,state.policy,state.stock,state.normalCards);
  return '<section data-limited-root class="mc-review"><header class="mlc-hero"><div><small>LIMITED / MERCENARY CONTRACT</small><h3>리미티드 용병팩</h3><p>일반 용병 C~SSS · 희귀한 SS·SSS 리미티드</p><b data-limited-saved-mode>현재 저장: '+savedMode+' · '+(state.userOpeningEnabled?'개봉 운영 중':savedMode==='OFF'?'개봉 중지':'설정 확인 필요')+'</b></div><img src="/assets/ui/packs/limited-v1/pack-640.webp" alt=""></header>'+
  '<div class="mc-release-strip"><p>ON 저장 시 개봉을 허용하고, OFF 저장 시 새 개봉을 중지합니다. 발행 수량과 확정된 결과는 보존됩니다.</p><b>확률 r'+state.revision+' · 팩 r'+state.packRevision+'</b></div>'+
  '<section class="mc-fields-section mlc-operation"><div class="mc-section-title"><h3>운영 ON / OFF</h3><p>선택 후 설정 저장을 눌러 적용하세요.</p></div><div class="mlc-mode-switch" role="group" aria-label="리미티드팩 운영 상태">'+['ON','OFF'].map(mode=>'<button type="button" data-limited-mode="'+mode+'" aria-pressed="'+(s.mode===mode)+'" '+(busy||mode==='ON'&&!state.releaseEnabled?'disabled':'')+'><b>'+mode+'</b><span>'+(mode==='ON'?'개봉 허용':'개봉 중지')+'</span></button>').join('')+'</div><p data-limited-mode-status aria-live="polite">현재 저장 '+savedMode+' · 선택 '+s.mode+(dirty?' · 저장 전':'')+'</p></section>'+
  '<section class="mc-fields-section"><div class="mc-section-title"><h3>개봉 가격</h3><p>10회 가격은 1회 가격과 별도로 설정합니다. 자동 진행에도 선택한 묶음 가격이 적용됩니다.</p></div><div class="mc-fields">'+
  ['single','ten'].map((k,i)=>field((i?'10회':'1회')+' · 코인','data-limited-price="'+k+'" type="number" min="1" max="100000000000000" step="1"',s.prices[k])).join('')+'</div></section>'+
  '<section class="mc-fields-section"><div class="mc-section-title"><h3>일반 용병 확률</h3><p>일반 C·B·A·S·SS·SSS가 등장합니다. 등급별 확률은 이 팩에서 독립 설정하며, 등급 안에서는 기존 용병 CMS의 획득 ON·가중치를 따릅니다.</p></div><div class="mc-fields">'+
  LIMITED_NORMAL_RANKS.map(rank=>rateField(rank+' 일반 용병 · %','data-limited-normal-rate="'+rank+'"',s.normalRankRatesPpm[rank])).join('')+'</div></section>'+
  '<section class="mc-fields-section mlc-limited-odds"><div class="mc-section-title"><h3>리미티드 별도 확률</h3><p>일반 SS·SSS 확률과 구분된 개봉 1회당 절대 확률입니다. 0.0001% 단위로 설정할 수 있으며 두 항목을 합쳐 다시 추첨하거나 일반 등급 확률을 곱하지 않습니다.</p></div><div class="mc-fields">'+
  ['SS','SSS'].map(rank=>rateField(rank+' 리미티드 · %','data-limited-rate="'+rank+'"',state.policy.rankRatesPpm[rank])).join('')+
  '</div></section><section class="mc-fields-section"><div class="mc-section-title"><h3>재료 · 꽝 확률</h3><p>일반 용병 6등급 + SS 리미티드 + SSS 리미티드 + 재료·꽝 합계가 100%여야 개봉할 수 있습니다.</p></div><div class="mc-fields">'+
  s.extraRewards.map(r=>'<div>'+rateField(LIMITED_EXTRA_REWARDS.find(m=>m.id===r.id).name+' · %','data-limited-extra-rate="'+r.id+'"',r.chancePpm)+(r.id==='NONE'?'':field('당첨 시 지급 개수','data-limited-extra-quantity="'+r.id+'" type="number" min="1" max="1000000000" step="1"',r.quantity))+'</div>').join('')+'</div><p data-limited-total>현재 합계 '+formatDrawPercent(readiness.totalPpm)+'%</p></section>'+
  '<div class="mc-section-title"><h3>리미티드 발행 한도 · '+state.cards.length+'종</h3><p>발행 한도 0장 또는 가중치 0은 추첨에서 제외합니다. 동일 등급의 잔여 리미티드끼리 가중치로 추첨하며 해당 등급이 모두 소진되면 개봉을 멈춥니다.</p></div><div class="mlc-cards">'+
  state.cards.map(c=>{const stock=state.stock.find(r=>r.code===c.code);return '<article><img loading="lazy" src="/assets/ui/packs/limited-v1/'+c.code.toLowerCase()+'-640.webp" alt=""><div><small>'+esc(c.code)+' / '+esc(c.rank)+' LIMITED</small><h4>'+esc(c.name)+'</h4><p>발행 <b>'+fmt(stock.issued)+'</b> · 잔여 '+fmt(stock.remaining)+'</p><div class="mc-fields">'+field('서버 전체 발행 한도','data-limited-cap="'+c.code+'" type="number" min="'+stock.issued+'" max="1000000" step="1"',s.stockLimits[c.code])+field('등급 내 가중치','data-limited-weight="'+c.code+'" type="number" min="0" max="1000000" step="1"',state.policy.cardWeights[c.code])+'</div></div></article>';}).join('')+'</div>'+
  '<label class="mc-field"><span>운영 메모</span><textarea data-limited-notes maxlength="2000">'+esc(state.policy.notes)+'</textarea></label>'+
  '<label class="mc-field"><span>저장 사유 · 4자 이상</span><input data-limited-reason maxlength="500" value="'+esc(pending?.reason||'리미티드팩 운영 설정 변경')+'"></label>'+
  '<p role="status" aria-live="polite">'+esc(notice||'가격·확률·한도는 미정으로 저장할 수 있습니다.')+'</p>'+
  '<div class="mc-savebar"><span>선택한 운영 상태·설정을 함께 저장</span><div><button data-limited-reload '+(busy?'disabled':'')+'>다시 불러오기</button><button data-limited-save class="mc-primary" '+(busy||!dirty?'disabled':'')+'>'+(pending?'저장 결과 재확인':'설정 저장')+'</button></div></div></section>';
 }
 async function load(){
  if(busy)return;const token=generation;busy=true;notice='불러오는 중…';onRender();
  try{const next=await request();if(token!==generation)return;state=next;savedMode=state.packSettings.mode;dirty=false;pending=null;notice='리미티드팩 설정을 불러왔습니다.';}catch(e){if(token===generation)notice=e.message;}
  finally{if(token===generation){busy=false;onRender();}}
 }
 async function save(){
  if(busy||!dirty)return;
  try{
   for(const input of root.querySelectorAll('input,textarea'))if(!input.reportValidity())return;
   validateLimitedPolicy(state.policy);validateLimitedPack(state.packSettings);
   if(state.packSettings.mode==='ON'){const ready=limitedPackReadiness(state.packSettings,state.policy,state.stock,state.normalCards);if(!ready.ready)throw Error(ready.blockers.join(' '));}
   pending??={expectedRevision:state.revision,expectedPackRevision:state.packRevision,policy:structuredClone(state.policy),packSettings:structuredClone(state.packSettings),requestId:crypto.randomUUID(),reason:$('[data-limited-reason]').value.trim()};
   if(pending.reason.length<4)throw Error('저장 사유를 4자 이상 입력하세요.');
  }catch(e){notice=e.message;onRender();return;}
  const token=generation;busy=true;onRender();
  try{const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(token!==generation)return;state=next;savedMode=state.packSettings.mode;dirty=false;pending=null;notice='리미티드팩 저장 완료 · '+savedMode+(savedMode==='ON'?' 개봉 허용':' 개봉 중지');}
  catch(e){if(token===generation){notice=e.message;if(e.status>=400&&e.status<500)pending=null;}}
  finally{if(token===generation){busy=false;onRender();}}
 }
 function mount(element){
  root=element;if(!root)return;
  $('[data-limited-reload]')?.addEventListener('click',()=>void load());$('[data-limited-save]')?.addEventListener('click',()=>void save());
  const markDirty=()=>{dirty=true;pending=null;const button=$('[data-limited-save]');button.disabled=busy;button.textContent='설정 저장';$('[data-limited-mode-status]').textContent='현재 저장 '+savedMode+' · 선택 '+state.packSettings.mode+' · 저장 전';};
  root.querySelectorAll('[data-limited-mode]').forEach(button=>{button.onclick=()=>{if(busy||!state)return;state.packSettings.mode=button.dataset.limitedMode;root.querySelectorAll('[data-limited-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.limitedMode===state.packSettings.mode)));markDirty();};});
  root.querySelectorAll('input,textarea').forEach(input=>{
   input.disabled=busy;
   input.oninput=()=>{
    if(!state)return;const d=input.dataset,n=input.value===''?null:Number(input.value),percent=()=>input.value===''?null:(parseDrawPercent(input.value)??NaN);
    if(d.limitedNormalRate)state.packSettings.normalRankRatesPpm[d.limitedNormalRate]=percent();
    else if(d.limitedRate)state.policy.rankRatesPpm[d.limitedRate]=percent();
    else if(d.limitedWeight)state.policy.cardWeights[d.limitedWeight]=n??NaN;
    else if(d.limitedPrice)state.packSettings.prices[d.limitedPrice]=n;
    else if(d.limitedCap)state.packSettings.stockLimits[d.limitedCap]=n;
    else if(d.limitedExtraRate)state.packSettings.extraRewards.find(r=>r.id===d.limitedExtraRate).chancePpm=percent();
    else if(d.limitedExtraQuantity)state.packSettings.extraRewards.find(r=>r.id===d.limitedExtraQuantity).quantity=n;
    else if(input.hasAttribute('data-limited-notes'))state.policy.notes=input.value;
    markDirty();
    $('[data-limited-total]').textContent='현재 합계 '+formatDrawPercent(limitedPackReadiness(state.packSettings,state.policy,state.stock,state.normalCards).totalPpm)+'%';
   };
  });
  if(!state&&!busy&&!notice)void load();
 }
 return {html,mount,reset(){generation++;state=null;root=null;dirty=false;busy=false;pending=null;notice='';savedMode='OFF';}};
}
