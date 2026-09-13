import {jointAdminRequest as request} from '../js/joint-account-transport.mjs';
if(!document.querySelector('[data-hyper-opening-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/admin/hyper-pack-opening.css?v=2093';link.dataset.hyperOpeningStyle='';document.head.append(link);}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,busy=false,message='',failure=false,flight;
const key='cnine.admin.hyper-opening.pending';
function pending(){try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
function render(){
  for(const host of document.querySelectorAll('[data-hyper-opening]')){
    host.innerHTML=`<section class="hyper-opening-control" style="margin:18px 0;padding:20px;border:1px solid #b49b684d;border-radius:10px;background:#132225;color:#ece1ca"><header style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><small>하이퍼팩 운영</small><h3 style="margin:5px 0 12px">유저 개봉 ${state?.mode||'확인 중'}</h3></div><b style="color:${state?.mode==='ON'?'#a8d5a2':'#e3b57d'}">${state?state.ready?'시작 준비 완료':'설정 확인 필요':'조회 중'}</b></header><p style="font-size:13px;line-height:1.8">1회 5억 코인 · 10회 50억 코인<br>ON을 누르면 상점의 실제 개봉과 계정 지급이 시작됩니다.</p>${state?`<p style="font-size:12px">등급별 용병 ${Object.entries(state.rankCounts).map(([rank,n])=>`${rank} ${n}종`).join(' · ')}<br>확률 r${state.drawRevision??'—'} · 용병 설정 r${state.cmsRevision??'—'}</p>`:''}${state?.blockers?.length?`<ul>${state.blockers.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}<div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-hyper-mode="ON" ${busy||!state?.ready||state.mode==='ON'?'disabled':''}>ON · 개봉 시작</button><button type="button" data-hyper-mode="OFF" ${busy||!state||state.mode==='OFF'?'disabled':''}>OFF · 개봉 중지</button><button type="button" data-hyper-reload ${busy?'disabled':''}>상태 새로고침</button>${pending()?'<button type="button" data-hyper-retry>이전 변경 결과 확인</button>':''}</div><p role="status" style="font-size:12px;color:${failure?'#ffb099':'#b8c9c5'}">${esc(message||'개봉 상태만 변경하며, 확률과 지급 수량은 저장된 값을 사용합니다.')}</p></section>`;
    host.querySelectorAll('[data-hyper-mode]').forEach(button=>button.onclick=()=>void save(button.dataset.hyperMode));
    host.querySelector('[data-hyper-reload]').onclick=()=>void reload();
    const retry=host.querySelector('[data-hyper-retry]');if(retry)retry.onclick=()=>void save(pending()?.mode);
  }
}
async function reload(){if(flight)return flight;busy=true;render();flight=request('admin/mercenaries/opening').then(value=>{state=value;failure=false;message='';}).catch(error=>{message=error.message;failure=true;}).finally(()=>{flight=null;busy=false;render();});return flight;}
async function save(mode){
  if(busy||!state)return;busy=true;failure=false;message='운영 상태를 저장하고 있습니다.';
  let body=pending();if(body&&body.mode!==mode){busy=false;message='이전 변경 결과를 먼저 확인하세요.';render();return;}
  if(!body){body={mode,revision:state.revision,requestId:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(body));}
  render();try{state=await request('admin/mercenaries/opening',{method:'PATCH',body});sessionStorage.removeItem(key);message=`저장 완료 · 유저 개봉 ${state.mode}`;localStorage.setItem('cnine.hyper-opening.changed',String(Date.now()));}
  catch(error){failure=true;message=error.message;if(error.status>=400&&error.status<500&&!/^JOINT_.*(LOCK|PENDING)/.test(error.code||''))sessionStorage.removeItem(key);}
  finally{busy=false;render();}
}
export function mountHyperOpening(){
  let added=false;for(const host of document.querySelectorAll('[data-hyper-opening]:not([data-opening-bound])')){host.dataset.openingBound='1';added=true;}
  if(!added)return;render();if(!state)void reload();
}
const observer=new MutationObserver(mountHyperOpening);observer.observe(document.body,{childList:true,subtree:true});
addEventListener('pagehide',()=>observer.disconnect(),{once:true});mountHyperOpening();
