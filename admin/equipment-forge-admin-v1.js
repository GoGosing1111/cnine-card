import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {mountForgePolicyEditor} from './equipment-forge-policy-editor-v1.mjs?v=20260922-ready';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let panel, navButton, publicHost, policyHost, editor, data, busy=false, dirty=false, notice='', generation=0;
function powerTable(){
  const p=data?.powerStandard;if(!p)return '';
  return `<section class="forge-power-standard"><h3>확정 전투력 · 최대 +${p.maxLevel}</h3><p>무기·방어구·장신구의 원래 전투력 기준입니다. 전투력 규칙은 임의 변경하지 않습니다.</p><table><thead><tr><th scope="col">단계</th><th scope="col">누적 증가 · 최종 배율</th><th scope="col">단계 상승분</th></tr></thead><tbody>${p.bonusPercentByLevel.map((bonus,level)=>`<tr ${level>=9?'class="forge-power-highlight"':''}><th scope="row">+${level}</th><td>+${bonus}% · ${((100+bonus)/100).toFixed(2)}배</td><td>${level?'+'+(bonus-p.bonusPercentByLevel[level-1])+'%':'—'}</td></tr>`).join('')}</tbody></table><p>PVE 90% · PVP 10%. 배틀슈트는 별도 전력으로 유지합니다.</p></section>`;
}
function renderPublic(){
  const s=data?.settings;if(!publicHost)return;
  publicHost.innerHTML=`<details class="forge-public-settings"><summary>유저 공개 · 안내문 <span>${s?.publicVisible?'공개 ON':'설정 확인'}</span></summary><p role="status">${esc(notice)}</p>${s?`<form><fieldset ${busy?'disabled':''}><label>유저 공개<select name="publicVisible"><option value="true" ${s.publicVisible?'selected':''}>ON · 강화 센터 공개</option><option value="false" ${!s.publicVisible?'selected':''}>OFF · 보유 장비 조회 비공개</option></select></label><label>강화·복구 실행<select name="executionMode"><option value="OFF" ${s.executionMode==='OFF'?'selected':''}>OFF · 실행 중지</option><option value="ON" ${s.executionMode==='ON'?'selected':''} ${data.executionReady?'':'disabled'}>ON · 출시 승인 후</option></select></label><label class="forge-cms-wide">유저 안내<textarea name="notice" maxlength="500" rows="3">${esc(s.notice)}</textarea></label><div class="forge-cms-actions"><small>공개 설정 r${s.revision}</small><button type="button" data-public-reload>다시 불러오기</button><button type="submit">공개 설정 저장</button></div></fieldset></form><p class="forge-public-note">공개 설정 저장과 강화 정책 저장은 별개입니다. 어느 쪽을 저장해도 운영 실행은 자동으로 켜지지 않습니다.</p>`:'<button type="button" data-public-reload>불러오기</button>'}</details><details class="forge-power-details"><summary>확정 전투력 · 출시 조건</summary>${powerTable()}<div class="forge-cms-gates"><h3>ON 전환 준비 조건</h3><ul>${(data?.pending||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ul><p>장비 강화·보호·복구 경제 설정 및 공동 출시 승인이 필요합니다. CMS 초안이나 DB의 ON 값만으로 활성화되지 않습니다.</p></div></details>`;
  publicHost.querySelector('[data-public-reload]').onclick=()=>{if(!dirty||confirm('편집 중인 공개 설정을 버리고 다시 불러올까요?'))void loadPublic();};
  const form=publicHost.querySelector('form');
  if(form){form.oninput=()=>dirty=true;form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;const formData=new FormData(form),settings={publicVisible:formData.get('publicVisible')==='true',executionMode:String(formData.get('executionMode')),notice:String(formData.get('notice'))};
    const stamp=generation;busy=true;form.querySelector('fieldset').disabled=true;
    try{const result=await api('admin/equipment-forge',{method:'PATCH',body:{expectedRevision:s.revision,settings}});if(stamp!==generation)return;data=result;dirty=false;notice='저장 완료. 유저 공개 설정을 반영했습니다. 강화 정책 초안은 그대로입니다.';renderPublic();publicHost.querySelector('details').open=true;}
    catch(error){if(stamp===generation)publicHost.querySelector('[role=status]').textContent=error.message;}
    finally{busy=false;if(stamp===generation)publicHost.querySelector('fieldset').disabled=false;}
  };}
}
async function loadPublic(){if(busy)return;const stamp=generation;busy=true;try{const result=await api('admin/equipment-forge');if(stamp!==generation)return;data=result;dirty=false;notice='현재 공개 설정입니다.';}catch(error){if(stamp===generation)notice=error.message;}finally{busy=false;if(stamp===generation)renderPublic();}}
function start(){
  const nav=document.getElementById('nav'),main=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!main||!role)return;
  navButton=document.createElement('button');navButton.type='button';navButton.dataset.view='equipment-forge';navButton.textContent='장비 강화';navButton.hidden=true;nav.insertBefore(navButton,nav.querySelector('[data-view="settings"]'));
  panel=document.createElement('section');panel.id='view-equipment-forge';panel.className='view';panel.hidden=true;
  panel.innerHTML='<div class="forge-cms"><header><div><small>UPGRADE LAB / POLICY CONTROL</small><h2>장비 강화 운영 설정</h2><p>강화 재료와 확률부터 보호권·파괴 복구까지, 한곳에서 관리합니다.</p></div><a href="/equipment-forge/" target="_blank" rel="noopener">유저 화면 ↗</a></header><div data-forge-policy></div><div data-forge-public></div></div>';
  main.append(panel);policyHost=panel.querySelector('[data-forge-policy]');publicHost=panel.querySelector('[data-forge-public]');let opened=false;
  const show=()=>{if(navButton.hidden)return;document.querySelectorAll('.view').forEach(view=>view.hidden=view!==panel);document.querySelectorAll('#nav [data-view]').forEach(button=>button.classList.toggle('active',button===navButton));document.getElementById('pageTitle').textContent='장비 강화';history.replaceState(null,'','#equipment-forge');if(!editor)editor=mountForgePolicyEditor(policyHost);if(!data)void loadPublic();};
  navButton.addEventListener('click',event=>{event.stopImmediatePropagation();show();},true);
  const access=()=>{navButton.hidden=role.textContent.trim()!=='OWNER';if(navButton.hidden){generation++;panel.hidden=true;editor?.destroy();editor=null;data=null;dirty=false;opened=false;publicHost.replaceChildren();}else if(location.hash==='#equipment-forge'&&!opened){opened=true;show();}};
  new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
  window.addEventListener('beforeunload',event=>{if(dirty||editor?.dirty){event.preventDefault();event.returnValue='';}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
