import {jointAdminRequest} from '../js/joint-account-transport.mjs';
import {AUCTION_ASSET_TYPES,auctionCoinLabel} from '../shared/auction-user-policy-v1.mjs?v=20261103-live-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>auctionCoinLabel(Number(v||0));
const api=(action,body)=>jointAdminRequest('auction/user/admin/'+action,{method:body===undefined?'GET':'POST',...(body!==undefined?{body}:{})});
const key=a=>a.kind+':'+String(a.policyRef??a.ref);
export async function mountAuctionCms(root,request=api){
 let state=null,bgm=null,blocked=new Map(),pendingHost=null,busy=false;
 root.innerHTML='<p class="auc-admin-status" role="status" aria-live="polite">경매 설정을 불러오는 중입니다.</p><div data-auction-editor></div>';
 const status=root.querySelector('[role=status]'),editor=root.querySelector('[data-auction-editor]');
 const report=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
 async function operation(work){if(busy)return;busy=true;root.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=true);try{await work();}catch(e){report(e.message,true);}finally{busy=false;root.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=false);}}
 function draw(){
  blocked=new Map(state.policy.blockedAssets.map(a=>[key(a),a]));
  const available=state.catalog.filter(a=>a.systemEligible&&a.tradeable&&!blocked.has(key(a)));
  const lots=[state.active,...state.queue].filter(Boolean);
  editor.innerHTML=`<header><div><small>OWNER · 경매 관리</small><h2>경매장</h2><p>동시에 1건 · 예약 순서대로 시작 · 실제 시작부터 2시간</p></div><button type="button" data-reload>새로 불러오기</button></header>
  <section><h3>진행 · 예약 현황</h3><p>진행 ${state.active?1:0}건 · 예약 ${state.queueCount??state.queue.length}건</p><div class="auc-admin-lots">${lots.map(a=>`<article><span>${a.status==='ACTIVE'?'진행 중':'예약 #'+a.queueOrder} · ${a.sourceKind==='SYSTEM'?'운영자 개최':'유저 판매'}</span><b>${esc(a.asset.name)} × ${a.asset.quantity.toLocaleString('ko-KR')}</b><small>${esc(a.sellerName)} · 시작가 ${money(a.startPrice)} 코인${a.endsMs?' · 종료 '+new Date(a.endsMs).toLocaleString('ko-KR'):''}</small>${a.status==='QUEUED'?`<button type="button" data-cancel="${esc(a.id)}">예약 취소</button>`:''}</article>`).join('')||'<p>진행·예약 중인 경매가 없습니다.</p>'}</div><p>유저 예약을 취소하면 물품과 티켓을 반환합니다. 진행 중인 경매는 종료 시 자동 정산됩니다.</p></section>
  <section><h3>운영자 경매 개최</h3><p>운영 물품을 공급합니다. 개최 티켓과 운영자 보유분을 소모하지 않으며, 낙찰금은 운영자에게 지급되지 않습니다.</p><form data-host><div class="auc-admin-fields"><label>물품 검색<input type="search" data-host-search placeholder="이름 · 코드"></label><label>경매 품목<select name="asset" required><option value="">품목 선택</option>${available.map(a=>`<option value="${esc(key(a))}" data-name="${esc((a.name+' '+a.ref).toLowerCase())}">${esc(AUCTION_ASSET_TYPES[a.kind])} · ${esc(a.name)} (${esc(a.ref)})</option>`).join('')}</select></label><label>수량<input name="quantity" type="number" min="1" max="10000000000" value="1" required></label><label>시작가 (코인)<input name="startPrice" type="text" inputmode="numeric" value="10000000" required></label></div><p data-host-summary>물품을 선택하세요. 장비·이동수단은 1개씩 개최합니다.</p><button type="submit" ${state.policy.operatorEnabled?'':'disabled'}>운영자 경매 개최 / 예약</button></form></section>
  <section><form data-policy><h3>운영 · 경매 불가능 품목</h3><div class="auc-admin-switches"><label><input name="enabled" type="checkbox" ${state.policy.enabled?'checked':''}> 유저 경매 개최 허용</label><label><input name="operatorEnabled" type="checkbox" ${state.policy.operatorEnabled?'checked':''}> 운영자 경매 개최 허용</label></div><p>스위치를 끄거나 품목을 금지해도 이미 등록된 경매는 약정대로 진행됩니다. 신규 개최부터 적용합니다. 현재 설정 r${state.policy.revision}</p><div class="auc-admin-fields"><label>종류<select data-block-kind><option value="">전체</option>${Object.entries(AUCTION_ASSET_TYPES).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label>품목 검색<input data-block-search type="search" placeholder="이름 · 품목 코드"></label><label><input data-only-blocked type="checkbox"> 금지 품목만 보기</label></div><p data-block-count></p><div class="auc-admin-catalog" data-block-list></div><p>체크한 품목은 유저·운영자 모두 신규 개최할 수 없습니다. 장비는 같은 종류 전체에 적용됩니다. 계정 전용 이용권과 개최 티켓은 거래할 수 없습니다.</p><button type="submit">경매 설정 저장</button></form></section>
  <section><form data-bgm><h3>금액별 입찰 BGM</h3><p>한 번에 추가 입찰한 금액으로 발동합니다. 위쪽 규칙부터 우선 적용 · 최대 80개 · 상한 0은 무제한 · #av=숫자로 음량을 유지합니다.</p><div data-bgm-list></div><button type="button" data-bgm-add>발동 구간 추가</button><button type="submit">BGM 설정 저장</button></form></section>`;
  editor.querySelector('[data-reload]').onclick=()=>void operation(reload);
  editor.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>{if(!confirm('이 예약을 취소할까요? 유저 물품과 티켓은 반환됩니다.'))return;void operation(async()=>{await request('cancel',{lotId:b.dataset.cancel});await reload();report('예약 취소와 반환을 완료했습니다.');});});
  const host=editor.querySelector('[data-host]'),assetInput=host.elements.asset;
  host.querySelector('[data-host-search]').oninput=e=>{for(const option of assetInput.options)if(option.value)option.hidden=!option.dataset.name.includes(e.target.value.trim().toLowerCase());};
  host.oninput=()=>{pendingHost=null;const a=available.find(a=>key(a)===assetInput.value),price=Number(host.elements.startPrice.value);host.querySelector('[data-host-summary]').textContent=a?`${a.name} × ${host.elements.quantity.value}개 · 시작가 ${Number.isSafeInteger(price)&&price>=0?money(price):'확인 필요'} 코인 · 2시간 진행`:'물품을 선택하세요.';};
  host.onsubmit=e=>{e.preventDefault();void operation(async()=>{if(!state.policy.operatorEnabled)throw Error('운영자 개최 허용을 먼저 켜고 저장하세요.');const asset=available.find(a=>key(a)===assetInput.value);if(!asset)throw Error('개최할 품목을 선택하세요.');pendingHost??={kind:asset.kind,ref:asset.ref,quantity:Number(host.elements.quantity.value),startPrice:Number(host.elements.startPrice.value),requestId:'AUCTION_CMS_'+crypto.randomUUID()};await request('host',pendingHost);pendingHost=null;await reload();report('운영자 경매를 등록했습니다. 앞선 경매가 있으면 예약 순서로 진행됩니다.');});};
  const policyForm=editor.querySelector('[data-policy]');
  const extras=state.policy.blockedAssets.filter(a=>!state.catalog.some(c=>key(c)===key(a))).map(a=>({...a,name:'현재 비활성 품목',tradeable:true}));
  function drawBlocks(){
   const kind=policyForm.querySelector('[data-block-kind]').value,search=policyForm.querySelector('[data-block-search]').value.trim().toLowerCase(),only=policyForm.querySelector('[data-only-blocked]').checked;
   const filtered=[...state.catalog,...extras].filter(a=>(!kind||a.kind===kind)&&(!search||(a.name+' '+a.ref).toLowerCase().includes(search))&&(!only||blocked.has(key(a))||a.tradeable===false));
   policyForm.querySelector('[data-block-count]').textContent=`운영자 지정 금지 ${blocked.size}개 · 검색 ${filtered.length}개${filtered.length>200?' (앞 200개 표시 · 검색으로 좁힐 수 있습니다)':''}`;
   const list=policyForm.querySelector('[data-block-list]');list.innerHTML=filtered.slice(0,200).map(a=>`<label><input type="checkbox" data-block="${esc(key(a))}" ${blocked.has(key(a))||a.tradeable===false?'checked':''} ${a.tradeable===false?'disabled':''}><span><b>${esc(a.name)}</b><small>${esc(AUCTION_ASSET_TYPES[a.kind])} · ${esc(a.policyRef??a.ref)}${a.blockedReason?' · '+esc(a.blockedReason):''}</small></span></label>`).join('')||'<p>검색 결과가 없습니다.</p>';
   list.querySelectorAll('[data-block]').forEach(input=>input.onchange=()=>{const a=[...state.catalog,...extras].find(a=>key(a)===input.dataset.block);if(input.checked)blocked.set(key(a),{kind:a.kind,ref:String(a.policyRef??a.ref)});else blocked.delete(key(a));policyForm.querySelector('[data-block-count]').textContent=`운영자 지정 금지 ${blocked.size}개 · 저장하면 신규 개최부터 적용됩니다.`;});
  }
  policyForm.querySelectorAll('[data-block-kind],[data-block-search],[data-only-blocked]').forEach(input=>input.oninput=drawBlocks);drawBlocks();
  policyForm.onsubmit=e=>{e.preventDefault();void operation(async()=>{await request('policy',{revision:state.policy.revision,enabled:policyForm.elements.enabled.checked,operatorEnabled:policyForm.elements.operatorEnabled.checked,blockedAssets:[...blocked.values()]});await reload();report('경매 운영 설정과 거래 금지 품목을 저장했습니다.');});};
  drawBgm();
 }
 function collectBgm(){return [...editor.querySelectorAll('[data-rule]')].map(row=>({minBid:Number(row.querySelector('[name=minBid]').value),maxBid:Number(row.querySelector('[name=maxBid]').value),bgmUrl:row.querySelector('[name=bgmUrl]').value,duration:Number(row.querySelector('[name=duration]').value)}));}
 function drawBgm(){
  editor.querySelector('[data-bgm-list]').innerHTML=bgm.rules.map((r,i)=>`<fieldset data-rule="${i}"><legend>${i+1}번 발동 구간</legend><div class="auc-admin-fields"><label>최소 추가 입찰<input name="minBid" inputmode="numeric" value="${r.minBid}" required></label><label>최대 추가 입찰 (0=무제한)<input name="maxBid" inputmode="numeric" value="${r.maxBid}" required></label><label>재생 시간 (초)<input name="duration" type="number" min="1" max="60" value="${r.duration}" required></label><label class="auc-admin-wide">음악 URL · 경로<input name="bgmUrl" value="${esc(r.bgmUrl)}" required></label></div><button type="button" data-up="${i}" ${i?'':'disabled'}>위로</button><button type="button" data-down="${i}" ${i<bgm.rules.length-1?'':'disabled'}>아래로</button><button type="button" data-remove="${i}">구간 삭제</button></fieldset>`).join('');
  for(const b of editor.querySelectorAll('[data-up],[data-down],[data-remove]'))b.onclick=()=>{bgm.rules=collectBgm();const i=Number(b.dataset.up??b.dataset.down??b.dataset.remove);if(b.hasAttribute('data-remove'))bgm.rules.splice(i,1);else{const j=i+(b.hasAttribute('data-up')?-1:1);[bgm.rules[i],bgm.rules[j]]=[bgm.rules[j],bgm.rules[i]];}drawBgm();};
  editor.querySelector('[data-bgm-add]').onclick=()=>{bgm.rules=collectBgm();if(bgm.rules.length>=80)return report('BGM은 최대 80개입니다.',true);bgm.rules.push({minBid:0,maxBid:0,bgmUrl:'',duration:40});drawBgm();};
  editor.querySelector('[data-bgm]').onsubmit=e=>{e.preventDefault();void operation(async()=>{bgm=await request('bgm',{revision:bgm.revision,rules:collectBgm()});drawBgm();report(`BGM ${bgm.rules.length}개 구간을 저장했습니다.`);});};
 }
 async function reload(){[state,bgm]=await Promise.all([request('state'),request('bgm')]);if(!root.isConnected)return;draw();report('최신 경매 설정을 불러왔습니다.');}
 try{await reload();}catch(e){report(e.message,true);}
 return {reload};
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='경매장';button.dataset.view='auction';button.hidden=true;panel.className='view auc-admin';panel.id='view-auction';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
 button.addEventListener('click',e=>{e.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='경매장';if(!mounted){mounted=true;void mountAuctionCms(panel);}},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
