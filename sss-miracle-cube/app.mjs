import {jointAccountRequest,jointAdminRequest} from '../js/joint-account-transport.mjs';
import {SSS_CUBE} from '../shared/sss-miracle-cube-v1.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const admin=new URLSearchParams(location.search).get('admin')==='1',api=admin?jointAdminRequest:jointAccountRequest,reduced=matchMedia('(prefers-reduced-motion: reduce)');
let state,busy=false,group='all',receipt=null,preview=false,animations=[],sequence=0,opener=null;
const key=()=>`cnine.sss-miracle.pending:${state?.accountId||'unknown'}`;
const pending=()=>{try{return JSON.parse(localStorage.getItem(key())||'null');}catch{return null;}};
const message=(text,error=false)=>{$('#status').textContent=text;$('#status').classList.toggle('is-error',error);};
function clearPending(){localStorage.removeItem(key());$('#recover').hidden=true;}
function controls(){
 const blocked=busy||admin||!state?.openingEnabled||Boolean(pending());
 $('#open-one').disabled=blocked||state.balance<1;$('#open-ten').disabled=blocked||state.balance<10;
 $('#preview').disabled=busy||!state?.isOwner;$('#recover').disabled=busy;$('#retry').disabled=busy;
}
function renderPool(){
 if(!state)return;
 document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
 const rows=state.catalog.filter(c=>group==='all'||c.limited===(group==='limited'));
 $('#pool').innerHTML=rows.map(c=>`<article class="sc-panel sc-card"><img src="${esc(c.sourceArt)}" alt="" loading="lazy"><div><span class="sc-edition">${c.limited?'SSS LIMITED':'SSS STANDARD'}</span><h3>${esc(c.name)}</h3><p>${c.limited?(c.remaining===null?'큐브 전용 한도 미등록':`큐브 잔여 ${c.remaining} / ${c.stockLimit}장`):'SSS 일반 용병'}</p><strong>${c.soldOut?'소진 · 추첨 제외':!c.available?'획득 불가':c.units===null?'확률 미설정':c.percent+'%'}</strong>${c.lockReason?`<p>${esc(c.lockReason)}</p>`:''}</div></article>`).join('')||'<p class="sc-empty">조건에 맞는 용병이 없습니다.</p>';
}
async function load(){
 $('#retry').hidden=true;
 try{
  state=await api(admin?'admin/sss-miracle-cube':'sss-miracle-cube/state');$('#balance').textContent=state.balance.toLocaleString('ko-KR');
  $('#opening-state').textContent=admin?'운영자 미리보기':state.openingEnabled?'개봉 가능':state.mode==='OFF'?'개봉 OFF':'개봉 중지';
  $('#owner-tools').hidden=!state.isOwner;$('#recover').hidden=!pending();
  renderPool();controls();message(admin?'연출 미리보기에서는 큐브를 사용하거나 용병을 지급하지 않습니다.':state.openingEnabled?(state.excludedCodes?.length?'소진된 용병을 제외한 현재 확률로 개봉합니다.':'구성과 확률을 확인한 뒤 개봉하세요.'):state.mode==='OFF'?'운영자가 개봉을 OFF로 설정했습니다.':state.blockers?.join(' ')||'개봉 구성을 확인하고 있습니다.');
  if(!admin&&!state.openingEnabled)$('#retry').hidden=false;
 }catch(e){message(e.status===401?'로그인 후 보유 큐브와 개봉 상태를 확인할 수 있습니다.':e.message,true);$('#retry').hidden=false;}
}
function selectResult(i){
 const d=receipt.draws[i];$('#result-art').src=d.sourceArt;$('#result-art').alt=d.name+' 용병 원화';$('#result-name').textContent=d.name;
 $('#result-edition').textContent=d.limited?'SSS LIMITED':'SSS STANDARD';
 $('#result-serial').textContent=preview?'연출 미리보기':d.limited?`${d.stockScope==='SSS_MIRACLE_CUBE'?'큐브 전용 한정':'기존 한정'} · No. ${d.serial} / ${d.stockLimit}`:d.duplicate?'중복 용병 +1장':'새로운 용병 획득';
 $('#result-count').textContent=preview?'실제 큐브 소모 · 용병 지급 없음':`총 보유 ${d.totalCopies}장 · 중복 ${d.duplicateCount}장`;
 document.querySelectorAll('[data-result]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.result)===i)));
}
function showResult(){
 if(!receipt)return;
 sequence++;for(const a of animations)a.cancel();animations=[];
 $('#cube-art').src=SSS_CUBE.image;$('#skip').hidden=true;$('#stage-caption').textContent='SSS 일반 · SSS 리미티드';
 $('#result-context').textContent=preview?'PREVIEW · 실제 지급 없음':`소환 완료 · SSS 용병 ${receipt.draws.length}장`;
 $('#result-list').innerHTML=receipt.draws.length>1?receipt.draws.map((d,i)=>`<button data-result="${i}" aria-label="${esc(d.name)} 결과 보기"><img src="${esc(d.sourceArt)}" alt=""></button>`).join(''):'';
 selectResult(Math.max(0,receipt.draws.findIndex(d=>d.limited)));if(!$('#result-dialog').open)$('#result-dialog').showModal();
 if(!preview)clearPending();busy=false;controls();message(preview?'연출 미리보기를 마쳤습니다.':`SSS 용병 ${receipt.draws.length}장을 획득했습니다.`);
}
async function reveal(){
 if(reduced.matches){showResult();return;}
 const current=++sequence,art=$('#cube-art'),opened=new Image();opened.src='/assets/ui/sss-miracle-cube-20261021/cube-open-768.webp';
 $('#skip').hidden=false;$('#stage-caption').textContent='봉인을 해제합니다';
 const animate=async(frames,options)=>{const a=art.animate(frames,{...options,fill:'forwards'});animations.push(a);try{await a.finished;}catch{}return current===sequence;};
 if(!await animate([{transform:'translateY(0)',filter:'brightness(1)'},{transform:'translateY(-14px)',filter:'brightness(1.6)'}],{duration:650,easing:'ease-in'}))return;
 try{await Promise.race([opened.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('image timeout')),4000))]);}catch{if(current===sequence)showResult();return;}
 if(current!==sequence)return;art.src=opened.src;$('#stage-caption').textContent=receipt.draws.some(d=>d.limited)?'리미티드의 봉인이 열립니다':'정점의 용병이 응답합니다';
 if(await animate([{transform:'translateY(-14px) scale(.95)',filter:'brightness(1.4)'},{transform:'translateY(-14px) scale(1.04)',filter:'brightness(1.1)'}],{duration:1100,easing:'ease-out'}))showResult();
}
async function open(count,recover=false){
 if(busy||!state||admin)return;opener=document.activeElement;busy=true;preview=false;controls();message('개봉 결과를 확인하고 있습니다.');
 try{
  let body=pending();if(!body){body={requestId:crypto.randomUUID(),count,expectedRevision:state.revision};localStorage.setItem(key(),JSON.stringify(body));$('#recover').hidden=false;}
  let result;if(recover){try{result=await api('sss-miracle-cube/receipt?requestId='+encodeURIComponent(body.requestId));}catch(e){if(e.code!=='JOINT_NOT_FOUND')throw e;}}
  if(!result||result.status==='PENDING')result=await api('sss-miracle-cube/open',{method:'POST',body});
  if(result.status!=='COMPLETED'||!result.draws?.length||result.accountId!==state.accountId)throw Error('개봉 영수증을 다시 확인해 주세요.');
  receipt=result;state.balance=result.balance;$('#balance').textContent=state.balance.toLocaleString('ko-KR');await reveal();
 }catch(e){
  if(['SSS_CUBE_INPUT','SSS_CUBE_CLOSED','SSS_CUBE_BALANCE','SSS_CUBE_NOT_READY','SSS_CUBE_STOCK','SSS_CUBE_POLICY_CHANGED','SSS_CUBE_CATALOG_CHANGED','JOINT_OPERATION_SUPERSEDED'].includes(e.code))clearPending();
  message(e.message,true);busy=false;controls();
 }
}
$('#open-one').onclick=()=>void open(1);$('#open-ten').onclick=()=>void open(10);$('#recover').onclick=()=>void open(pending()?.count||1,true);$('#retry').onclick=()=>void load();$('#skip').onclick=showResult;
document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{group=b.dataset.group;renderPool();});
$('#preview').onclick=async()=>{if(busy||!state?.isOwner)return;const limited=$('#preview-group').value==='limited',card=state.catalog.find(c=>c.limited===limited);if(!card){message('미리 볼 용병이 없습니다.',true);return;}opener=document.activeElement;preview=true;busy=true;receipt={draws:[{...card,mercenaryCode:card.code}]};controls();await reveal();};
$('#result-list').onclick=e=>{const b=e.target.closest('[data-result]');if(b)selectResult(Number(b.dataset.result));};
$('#result-close').onclick=$('#result-confirm').onclick=()=>$('#result-dialog').close();
$('#result-dialog').addEventListener('close',()=>{opener?.focus();if(!preview)void load();});
document.addEventListener('visibilitychange',()=>{animations.forEach(a=>document.hidden?a.pause():a.play());});window.addEventListener('pagehide',()=>{sequence++;animations.forEach(a=>a.cancel());});
void load();
