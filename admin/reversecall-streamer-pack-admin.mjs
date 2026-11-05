import {STREAMER_PACK} from '../shared/reversecall-streamer-pack-v1.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createStreamerPackEditor({request,onRender}){
 let state=null,busy=false,dirty=false,pending=null,notice='',generation=0;
 async function load(){if(busy)return;const token=generation;busy=true;onRender();try{const next=await request();if(token===generation){state=next;dirty=false;pending=null;notice='현재 판매 상태 '+state.settings.mode;}}catch(e){notice=e.message;}finally{if(token===generation){busy=false;onRender();}}}
 function html(){
  if(!state)return '<section data-streamer-pack-root class="mc-review"><p role="status">'+esc(notice||'스트리머 팩 설정을 불러옵니다.')+'</p><button data-streamer-reload>다시 불러오기</button></section>';
  return '<section data-streamer-pack-root class="mc-review blackcrown-cms"><header class="mlc-hero"><div><small>REVERSE CALL · STREAMER EXCLUSIVE</small><h3>'+STREAMER_PACK.name+'</h3><p>리버스랜드 등록 계정만 개봉할 수 있습니다.</p></div><img src="/'+STREAMER_PACK.image+'" alt="리버스콜 스트리머 팩"></header><p>가격·구성·확률·중복 규칙은 블랙크라운과 동일합니다. 블랙크라운 설정 변경도 함께 반영됩니다. 이 화면에서는 스트리머 팩의 판매 상태와 독립 재고만 관리합니다.</p><p>1회 '+Number(state.settings.prices.single).toLocaleString()+' 코인 · 10회 '+Number(state.settings.prices.ten).toLocaleString()+' 코인</p><label class="mc-field"><span>스트리머 팩 판매 상태</span><select data-streamer-mode><option value="ON" '+(state.settings.mode==='ON'?'selected':'')+'>ON · 등록 스트리머 개봉 가능</option><option value="OFF" '+(state.settings.mode==='OFF'?'selected':'')+'>OFF · 개봉 중지</option></select></label><div class="mlc-cards">'+state.stock.map(s=>{const c=state.cards.find(c=>c.code===s.code);return '<article><img loading="lazy" src="/'+esc(c.thumbnailArt)+'" alt="'+esc(c.name)+'"><div><small>'+c.rank+' LIMITED</small><h4>'+esc(c.name)+'</h4><p>독립 한도 '+s.limit+' · 발행 '+s.issued+' · 잔여 '+s.remaining+'</p><label class="mc-field"><span>추가할 수량</span><input data-streamer-add="'+s.code+'" type="number" min="0" max="10000" step="1" value="0"></label></div></article>';}).join('')+'</div><label class="mc-field"><span>저장 사유 · 4자 이상</span><input data-streamer-reason maxlength="500" value="스트리머 팩 독립 재고 관리"></label><p role="status" aria-live="polite">'+esc(notice)+'</p><div class="mc-savebar"><span>기존 발행·다른 팩 재고는 유지됩니다.</span><div><button data-streamer-reload '+(busy?'disabled':'')+'>다시 불러오기</button><button data-streamer-save '+(busy||!dirty?'disabled':'')+'>'+(pending?'저장 결과 재확인':'설정 저장')+'</button></div></div></section>';
 }
 function mount(root){if(!root)return;
  root.querySelector('[data-streamer-reload]').onclick=()=>void load();
  root.querySelectorAll('input,select').forEach(input=>{input.disabled=busy;input.oninput=()=>{dirty=true;pending=null;root.querySelector('[data-streamer-save]').disabled=false;};});
  const button=root.querySelector('[data-streamer-save]');if(button)button.onclick=async()=>{
   if(busy)return;const token=generation;
   try{for(const input of root.querySelectorAll('input'))if(!input.reportValidity())return;pending??={requestId:crypto.randomUUID(),expectedRevision:state.revision,mode:root.querySelector('[data-streamer-mode]').value,additions:[...root.querySelectorAll('[data-streamer-add]')].map(n=>({code:n.dataset.streamerAdd,quantity:Number(n.value)})).filter(c=>c.quantity>0),reason:root.querySelector('[data-streamer-reason]').value.trim()};if(pending.reason.length<4)throw Error('저장 사유를 4자 이상 입력하세요.');busy=true;notice='저장 결과를 확인합니다.';onRender();const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(token===generation){state=next;pending=null;dirty=false;notice='저장 완료 · 판매 상태 '+state.settings.mode;}}
   catch(e){if(token===generation){notice=e.message;if(e.status>=400&&e.status<500)pending=null;}}
   finally{if(token===generation){busy=false;onRender();}}
  };
  if(!state&&!busy&&!notice)void load();
 }
 return {html,mount,get dirty(){return dirty;},reset(){generation++;state=null;busy=false;dirty=false;pending=null;notice='';}};
}
