import {HALLOWEEN_PACK,validateHalloweenPack} from '../shared/mercenary-halloween-pack-v1.mjs';
import {parseLimitedPercent,formatLimitedPercent,LIMITED_RATE_STEP} from '../shared/mercenary-limited-rates-v1.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,attrs,value)=>'<label class="mc-field"><span>'+label+'</span><input '+attrs+' value="'+(value??'')+'" placeholder="미정"></label>';
const percent=n=>n===null?'':formatLimitedPercent(n);
export function createHalloweenMercenaryEditor({request,onRender}){
 let state=null,root=null,busy=false,dirty=false,pending=null,notice='',generation=0;
 function html(){
  if(!state)return '<section data-halloween-root class="mc-review"><p role="status">'+esc(notice||'할로윈 팩 설정을 불러오고 있습니다.')+'</p><button data-halloween-reload>다시 불러오기</button></section>';
  return '<section data-halloween-root class="mc-review"><header class="mlc-hero"><div><small>HALLOWEEN / SS LIMITED COLLECTION</small><h3>'+HALLOWEEN_PACK.name+'</h3><p>승인 일러스트 7종 · 캐릭터별 서버 전체 5장 한정</p><b>개방 OFF · 가격·확률은 OWNER 지정</b></div></header>'+
   '<div class="mc-release-strip"><p>일러스트만 먼저 공개했습니다. 이곳에 가격·확률을 저장해도 팩은 개방되지 않습니다.</p><b>초안 r'+state.revision+'</b></div>'+
   '<section class="mc-fields-section"><div class="mc-section-title"><h3>가격 초안</h3><p>미입력 값은 미정으로 보존됩니다.</p></div><div class="mc-fields">'+['single','ten'].map((key,i)=>field((i?'10회':'1회')+' · 코인','data-halloween-price="'+key+'" type="number" min="1" max="100000000000000" step="1"',state.settings.prices[key])).join('')+'</div></section>'+
   '<div class="mc-section-title"><h3>할로윈 7종 · 전용 획득 대상</h3><p>일반 팩·기존 리미티드팩·합성에서는 획득할 수 없습니다. 각 확률은 개봉 1회 기준 절대 확률이며 합계는 최대 100%입니다.</p></div><div class="mlc-cards">'+
   state.cards.map(c=>{const s=state.stock.find(r=>r.code===c.code);return '<article><img loading="lazy" src="/'+esc(c.thumbnailArt||c.sourceArt)+'" alt="'+esc(c.name)+'"><div><small>'+esc(c.code)+' / SS HALLOWEEN LIMITED</small><h4>'+esc(c.name)+'</h4><p>서버 한도 <b>5장</b> · 발행 '+s.issued+' · 잔여 '+s.remaining+'</p>'+field('획득 확률 · %','data-halloween-rate="'+c.code+'" type="number" min="0" max="100" step="'+LIMITED_RATE_STEP+'"',percent(state.settings.cardRatesPpm[c.code]))+'</div></article>';}).join('')+'</div>'+
   '<section class="mc-fields-section"><div class="mc-fields">'+field('꽝 확률 · %','data-halloween-miss type="number" min="0" max="100" step="'+LIMITED_RATE_STEP+'"',percent(state.settings.missRatePpm))+'</div></section>'+
   '<label class="mc-field"><span>저장 사유 · 4자 이상</span><input data-halloween-reason maxlength="500" value="'+esc(pending?.reason||'할로윈 팩 가격·확률 초안 설정')+'"></label><p role="status" aria-live="polite">'+esc(notice||'가격·확률 미정 · 개방 OFF')+'</p>'+
   '<div class="mc-savebar"><span>서버 한도 5장 고정 · 개방 OFF 유지</span><div><button data-halloween-reload '+(busy?'disabled':'')+'>다시 불러오기</button><button data-halloween-save class="mc-primary" '+(busy||!dirty?'disabled':'')+'>'+(pending?'저장 결과 재확인':'초안 저장')+'</button></div></div></section>';
 }
 async function load(){if(busy)return;const token=generation;busy=true;notice='불러오는 중…';onRender();try{const next=await request();if(token===generation){state=next;dirty=false;pending=null;notice='가격·확률 초안을 불러왔습니다. 개방은 OFF입니다.';}}catch(e){if(token===generation)notice=e.message;}finally{if(token===generation){busy=false;onRender();}}}
 async function save(){
  if(busy||!dirty)return;
  try{for(const input of root.querySelectorAll('input'))if(!input.reportValidity())return;validateHalloweenPack(state.settings);pending??={expectedRevision:state.revision,settings:structuredClone(state.settings),requestId:crypto.randomUUID(),reason:root.querySelector('[data-halloween-reason]').value.trim()};if(pending.reason.length<4)throw Error('저장 사유를 4자 이상 입력하세요.');}catch(e){notice=e.message;onRender();return;}
  const token=generation;busy=true;onRender();try{const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(token===generation){state=next;dirty=false;pending=null;notice='초안 저장 완료 · 개방 OFF 유지';}}catch(e){if(token===generation){notice=e.message;if(e.status>=400&&e.status<500)pending=null;}}finally{if(token===generation){busy=false;onRender();}}
 }
 function mount(element){
  root=element;if(!root)return;root.querySelector('[data-halloween-reload]')?.addEventListener('click',()=>void load());root.querySelector('[data-halloween-save]')?.addEventListener('click',()=>void save());
  root.querySelectorAll('input').forEach(input=>{input.disabled=busy;input.oninput=()=>{if(!state)return;const d=input.dataset,value=input.value===''?null:Number(input.value),rate=input.value===''?null:parseLimitedPercent(input.value)??NaN;if(d.halloweenPrice)state.settings.prices[d.halloweenPrice]=value;else if(d.halloweenRate)state.settings.cardRatesPpm[d.halloweenRate]=rate;else if(input.hasAttribute('data-halloween-miss'))state.settings.missRatePpm=rate;dirty=true;pending=null;const button=root.querySelector('[data-halloween-save]');button.disabled=busy;button.textContent='초안 저장';};});
  if(!state&&!busy&&!notice)void load();
 }
 return {html,mount,get dirty(){return dirty;},reset(){generation++;state=null;root=null;busy=false;dirty=false;pending=null;notice='';}};
}
