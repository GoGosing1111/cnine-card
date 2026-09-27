import {ICON_EFFECTS} from '../shared/icon-grade-v1.mjs';
import {createIconCard} from '../js/icon-card-v1.mjs';
import {mercenaryCmsRequest} from './mercenary-request-v1.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountIconCms(root,{request=options=>mercenaryCmsRequest(options,'/api/admin/icons')}={}){
  let state=null,documentDraft=null,selected='ICON-DIIM',busy=false,dirty=false,pending=null,disposed=false;
  root.innerHTML=`<div class="icon-cms"><header class="ic-head"><div><p class="ic-kicker">COLLECTION / OWNER STUDIO</p><h2>아이콘 <em>아카이브</em></h2><p>한 사람의 개성, 하나의 전투 스타일.</p></div><div class="ic-seal">ICON<span>CMS ONLY</span></div></header>
    <div class="ic-policy"><span>유저 도감 비공개</span><span>획득 미정</span><span>진화 미정</span><span>실전 적용 OFF</span></div>
    <div class="ic-workspace"><nav class="ic-roster" aria-label="아이콘 선택"></nav><div class="ic-detail"></div></div>
    <footer class="ic-savebar"><p class="ic-status" role="status" aria-live="polite">등록 정보를 불러오는 중…</p><div><button type="button" data-export disabled>편집본 내려받기</button><button type="button" data-reload>다시 불러오기</button><button class="ic-primary" type="button" data-save disabled>초안 저장</button></div></footer>
    <dialog class="ic-player"><header><strong>아이콘 · 전투 리소스 검수</strong><button type="button" data-close aria-label="스킬 검수 닫기">닫기 ×</button></header><div class="ic-player-body"></div></dialog></div>`;
  const $=s=>root.querySelector(s),status=$('.ic-status'),detail=$('.ic-detail'),roster=$('.ic-roster'),dialog=$('dialog');
  const row=()=>documentDraft?.cards.find(c=>c.code===selected);
  function controls(){
    root.querySelectorAll('button,input,textarea').forEach(b=>{if(!b.matches('[data-close]'))b.disabled=busy||(!state&&!b.matches('[data-reload]'))||!!pending&&b.matches('input,textarea,[data-character]');});
    $('[data-save]').disabled=busy||!state||(!dirty&&!pending);
    $('[data-save]').textContent=pending?'저장 결과 재확인':'초안 저장';
    $('[data-reload]').disabled=busy;
  }
  function draw(){
    if(disposed)return;
    roster.innerHTML=state.catalog.map((card,i)=>`<button type="button" data-character="${esc(card.code)}" aria-pressed="${card.code===selected}"><span class="ic-index">${String(i+1).padStart(2,'0')}</span><span><b>${esc(card.name)}</b><small>${esc(card.weapon)}</small></span><span class="ic-arrow">↗</span></button>`).join('');
    const card=state.catalog.find(c=>c.code===selected),draft=row();
    detail.innerHTML=`<section class="ic-showcase"><div class="ic-art"><p class="ic-eyebrow">ORIGINAL CARD</p><div class="ic-photo"></div></div><div class="ic-stage"><div class="ic-stage-title"><p class="ic-eyebrow">BATTLE CHARACTER</p><h3>${esc(card.name)}</h3><span>${esc(card.weapon)}</span></div><img class="ic-sd" src="/${esc(card.battleSprite)}" alt="${esc(card.name)} 전투 SD" width="768" height="768"><div class="ic-stage-foot"><span>SD 준비 완료</span><b>기본 전투력 <strong>180,000</strong></b></div></div></section>
      <section class="ic-skill"><div><p class="ic-eyebrow">SIGNATURE</p><h4>${esc(card.effects.find(e=>e.kind==='SKILL').name.split(' · ').at(-1))}</h4><p>평타 · ${esc(card.effects.find(e=>e.kind==='HIT').name.split(' · ').at(-1))} <span>각 16프레임</span></p></div><button type="button" data-play>스킬 검수 <span>▶</span></button></section>
      <section class="ic-tuning"><div class="ic-section-title"><h4>고유효과 초안</h4><span>빈칸은 미정 · 실전 반영 없음</span></div><div class="ic-fields">${ICON_EFFECTS.map(effect=>`<label>${esc(effect.name)}${effect.status==='PROPOSED'?'<small>신규 제안</small>':''}<span><input type="number" inputmode="decimal" step="any" min="${effect.min}" max="${effect.max}" data-effect="${effect.code}" aria-label="${effect.name} 초안" placeholder="미정" value="${draft.draft.effects.find(e=>e.code===effect.code).value??''}"><i>${effect.unit}</i></span></label>`).join('')}</div><label class="ic-notes">운영 메모<textarea maxlength="1200" rows="2" placeholder="연출 검수 의견이나 추후 확정할 내용을 기록하세요."></textarea></label></section>`;
    const photo=createIconCard(card);photo.querySelector('figcaption span').textContent='사용자 지정 사진 · 원본 보존';$('.ic-photo').append(photo);
    detail.style.setProperty('--ic-accent',card.accent||'#ead39a');$('textarea').value=draft.notes;controls();
  }
  async function load(){
    if(busy||disposed)return;busy=true;controls();status.textContent='등록 정보를 불러오는 중…';
    try{const next=await request();if(disposed)return;state=next;documentDraft=structuredClone(next.document);pending=null;dirty=false;draw();status.textContent=`${state.catalog.length}종 등록 · 저장 버전 ${state.revision} · 유저 도감 비공개`;}
    catch(error){if(!disposed)status.textContent=error.message;}
    finally{busy=false;if(!disposed)controls();}
  }
  async function save(){
    if(busy||!state||disposed)return;
    if(!pending){
      if(![...root.querySelectorAll('input')].every(el=>el.reportValidity()))return;
      pending={requestId:crypto.randomUUID(),expectedRevision:state.revision,document:structuredClone(documentDraft)};
    }
    busy=true;controls();status.textContent='초안을 저장하고 있습니다…';
    try{
      const next=await request({method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;
      state=next;documentDraft=structuredClone(next.document);pending=null;dirty=false;draw();status.textContent=`저장 완료 · 버전 ${next.revision} · 도감·획득·진화 잠금 유지`;
    }catch(error){
      if(disposed)return;
      if(error.status>=400&&error.status<500)pending=null;
      status.textContent=error.message+(pending?' 입력을 보존했습니다. 저장 결과 재확인을 눌러 주세요.':'');
    }finally{busy=false;if(!disposed)controls();}
  }
  function closePlayback(){dialog.close();$('.ic-player-body').replaceChildren();}
  root.addEventListener('input',event=>{
    if(busy||pending||!row())return;
    if(event.target.matches('[data-effect]'))row().draft.effects.find(e=>e.code===event.target.dataset.effect).value=event.target.value===''?null:Number(event.target.value);
    else if(event.target.matches('textarea'))row().notes=event.target.value;else return;
    dirty=true;status.textContent='저장하지 않은 초안이 있습니다.';controls();
  });
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-close]')){closePlayback();return;}
    if(busy||disposed)return;
    const character=event.target.closest('[data-character]');
    if(character&&!pending){selected=character.dataset.character;draw();}
    if(event.target.closest('[data-reload]')){
      if((dirty||pending)&&!confirm('저장하지 않은 편집을 버리고 서버 설정을 다시 불러올까요?'))return;
      void load();
    }
    if(event.target.closest('[data-save]'))void save();
    if(event.target.closest('[data-export]')&&documentDraft){
      const url=URL.createObjectURL(new Blob([JSON.stringify(documentDraft,null,2)],{type:'application/json'})),a=window.document.createElement('a');a.href=url;a.download='icon-cms-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    if(event.target.closest('[data-play]')&&state){
      const card=state.catalog.find(c=>c.code===selected),frame=window.document.createElement('iframe');
      frame.title=`${card.name} SD·스킬 검수`;frame.src=`/preview/icon-battle-assets-v1/?character=${encodeURIComponent(card.id)}`;
      $('.ic-player-body').replaceChildren(frame);dialog.showModal();
    }
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closePlayback();});
  void load();
  return {closePlayback,dispose(){disposed=true;closePlayback();root.replaceChildren();}};
}

function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');
  button.type='button';button.textContent='아이콘 카드';button.dataset.view='icon-cards';button.hidden=true;
  panel.className='view';panel.id='view-icon-cards';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=null;
  button.addEventListener('click',event=>{
    event.stopImmediatePropagation();if(button.hidden)return;
    document.querySelectorAll('.view').forEach(view=>view.hidden=view!==panel);
    document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));
    document.getElementById('pageTitle').textContent='아이콘 카드';
    if(!mounted)mounted=mountIconCms(panel);
  },true);
  new MutationObserver(()=>{if(panel.hidden)mounted?.closePlayback();}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;mounted?.dispose();mounted=null;}};
  new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
