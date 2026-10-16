const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FRAME='/preview/coop-defense-v1/assets/formation-v1/selection-frame.png';
const CREST='/preview/coop-defense-v1/assets/ui-v5/guardian-crest.png';
export class DefenseFormation{
 constructor({getLoadout,getOptions,refresh,onApply,onToast}){
  Object.assign(this,{getLoadout,getOptions,refresh,onApply,onToast});this.kind='MERCENARY';this.limit=24;this.busy=false;this.generation=0;
  this.dialog=document.createElement('dialog');this.dialog.className='defense-formation';this.dialog.setAttribute('aria-labelledby','formation-title');
  this.dialog.innerHTML=`<header class="formation-header"><div><p>DEFENSE · SQUAD ASSEMBLY</p><h2 id="formation-title">나의 출전 분대</h2><span>보유한 용병 2명과 카드 1장을 선택하세요.</span></div><button type="button" data-formation-close aria-label="분대 편성 닫기">닫기 ×</button></header>
   <div class="formation-tools"><div class="formation-tabs" aria-label="보유 종류"><button type="button" data-kind="MERCENARY" aria-pressed="true">용병 <b data-merc-count>0/2</b></button><button type="button" data-kind="CARD" aria-pressed="false">카드 <b data-card-count>0/1</b></button></div><label class="formation-search"><span class="sr-only">보유 캐릭터 이름 검색</span><input type="search" data-search placeholder="이름 검색" maxlength="60"></label><label><span class="sr-only">등급 필터</span><select data-grade aria-label="등급 필터"><option value="">모든 등급</option></select></label><button type="button" data-refresh aria-label="보유 목록 새로고침">새로고침</button></div>
   <div class="formation-body"><section class="formation-inventory" aria-label="보유 목록"><p class="formation-count" data-count></p><div class="formation-grid" data-inventory></div><button type="button" class="formation-more" data-more hidden>더 보기</button></section><aside class="formation-side"><h3>출전 편성</h3><div class="formation-selected" data-selected></div><div class="formation-detail" data-detail><p>원화를 누르면 선택·해제됩니다.</p></div><p class="formation-rule">디펜스에서는 역할별 기본 능력치와 전용 전술을 사용합니다. 웨이브 강화는 이번 전투에만 적용됩니다.</p></aside></div>
   <footer class="formation-footer"><p data-status role="status" aria-live="polite"></p><div><button type="button" data-formation-cancel>취소</button><button type="button" class="formation-apply" data-apply disabled>분대 배치 <span>›</span></button></div></footer>`;
  document.getElementById('defense-app').append(this.dialog);
  const $=s=>this.dialog.querySelector(s);this.$=$;
  this.dialog.addEventListener('cancel',event=>{event.preventDefault();if(!this.busy)this.close();});
  this.dialog.addEventListener('click',event=>{
   const button=event.target.closest('button');if(!button||this.busy)return;
   if(button.matches('[data-formation-close],[data-formation-cancel]'))return this.close();
   if(button.dataset.kind){this.kind=button.dataset.kind;this.query='';this.grade='';this.limit=24;$('[data-search]').value='';this.render();return;}
   if(button.hasAttribute('data-refresh'))return void this.reload();
   if(button.hasAttribute('data-more')){this.limit+=24;this.renderInventory();return;}
   if(button.hasAttribute('data-apply'))return void this.apply();
   if(button.dataset.remove){const code=button.dataset.remove;this.draft.mercenaries=this.draft.mercenaries.filter(c=>c!==code);if(this.draft.card===code)this.draft.card='';this.render();return;}
   if(button.dataset.choice)this.pick(button.dataset.choice);
  });
  $('[data-search]').addEventListener('input',e=>{this.query=e.target.value.trim().toLocaleLowerCase();this.limit=24;this.renderInventory();});
  $('[data-grade]').addEventListener('change',e=>{this.grade=e.target.value;this.limit=24;this.renderInventory();});
 }
 async open(kind='MERCENARY'){
  if(this.dialog.open)return;this.opener=document.activeElement;this.kind=kind;this.draft=structuredClone(this.getLoadout());this.query='';this.grade='';this.limit=24;this.detail=null;
  this.$('[data-search]').value='';this.dialog.showModal();this.render();await this.reload();
 }
 close(){if(this.busy)return;this.generation++;this.dialog.close();if(this.opener?.isConnected)this.opener.focus({preventScroll:true});}
 async reload(){
  if(this.busy)return;const generation=++this.generation;this.busy=true;this.setStatus('보유 목록을 불러오는 중입니다.');this.lock();
  try{await this.refresh();if(!this.dialog.open||generation!==this.generation)return;
   const options=this.getOptions();this.draft.mercenaries=this.draft.mercenaries.filter(code=>options.mercenaries.some(c=>c.code===code));if(!options.cards.some(c=>c.code===this.draft.card))this.draft.card='';this.setStatus('');
  }catch(e){this.setStatus(e.message);}
  finally{if(generation===this.generation){this.busy=false;this.render();}}
 }
 entries(){const o=this.getOptions();return this.kind==='MERCENARY'?o.mercenaries:o.cards;}
 selected(code){return this.draft.mercenaries.includes(code)||this.draft.card===code;}
 pick(code){
  const entry=this.entries().find(c=>c.code===code);if(!entry)return;this.detail=entry;
  if(this.kind==='MERCENARY'){
   if(this.draft.mercenaries.includes(code))this.draft.mercenaries=this.draft.mercenaries.filter(c=>c!==code);
   else if(this.draft.mercenaries.length<2)this.draft.mercenaries.push(code);
   else{this.setStatus('용병은 2명까지 배치합니다. 선택한 용병을 한 번 더 눌러 해제하세요.');this.renderDetail();return;}
  }else this.draft.card=this.draft.card===code?'':code;
  this.setStatus('');this.render();
 }
 portrait(entry){return `<span class="formation-portrait"><img class="formation-art" loading="lazy" src="${esc(entry.sourceArt)}" alt=""><img class="formation-frame" src="${FRAME}" alt=""></span>`;}
 renderInventory(){
  const all=this.entries(),items=all.filter(c=>(!this.query||c.name.toLocaleLowerCase().includes(this.query))&&(!this.grade||c.rank===this.grade));
  this.$('[data-count]').textContent=`${this.kind==='MERCENARY'?'출전 가능한 보유 용병':'보유 카드'} ${items.length}종`;
  this.$('[data-inventory]').innerHTML=items.slice(0,this.limit).map(c=>`<button type="button" class="formation-choice" data-choice="${esc(c.code)}" aria-pressed="${this.selected(c.code)}" aria-label="${esc(c.name)} ${this.selected(c.code)?'선택 해제':'선택'}">${this.portrait(c)}<span class="formation-grade">${esc(c.rank)}${c.kind==='CARD'&&c.level?' +'+c.level:''}</span><span class="formation-mark" aria-hidden="true"><img src="${CREST}" alt=""><b>${this.selected(c.code)?'✓':'+'}</b></span><strong>${esc(c.name)}</strong><small>${esc(c.roleName)} · ${esc(c.defense.skill)}</small></button>`).join('')||'<p class="formation-empty">조건에 맞는 보유 캐릭터가 없습니다.<br>검색·등급을 확인하거나 목록을 새로 불러와 주세요.</p>';
  this.$('[data-more]').hidden=items.length<=this.limit;this.lock();
 }
 renderDetail(){const c=this.detail;
  this.$('[data-detail]').innerHTML=c?`<p>디펜스 적용 능력</p><h4>${esc(c.name)}</h4><strong>${esc(c.roleName)} · ${esc(c.defense.skill)}</strong><dl><div><dt>체력</dt><dd>${c.defense.hp}</dd></div><div><dt>공격</dt><dd>${c.defense.attack}</dd></div><div><dt>전술 대기</dt><dd>${c.defense.cooldown/1000}초</dd></div></dl>${c.fallbackSprite?'<p>전용 SD가 없는 카드는 공용 전투 외형을 사용합니다.</p>':''}`:'<p>원화를 눌러 분대에 배치하세요.<br>용병은 선택 순서대로 전방·중앙에 배치됩니다.</p>';
 }
 render(){
  const all=this.getOptions(),rows=[...all.mercenaries,...all.cards];
  this.$('[data-merc-count]').textContent=this.draft.mercenaries.length+'/2';this.$('[data-card-count]').textContent=(this.draft.card?1:0)+'/1';
  this.dialog.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===this.kind)));
  this.$('[data-grade]').innerHTML='<option value="">모든 등급</option>'+[...new Set(this.entries().map(c=>c.rank))].map(g=>`<option value="${esc(g)}" ${this.grade===g?'selected':''}>${esc(g)}</option>`).join('');
  this.$('[data-selected]').innerHTML=[this.draft.mercenaries[0],this.draft.mercenaries[1],this.draft.card].map((code,i)=>{
   const c=rows.find(c=>c.code===code),label=i<2?'용병 '+(i+1):'카드';
   return `<div class="formation-slot"><span>${label}</span>${c?`<button type="button" data-remove="${esc(code)}" aria-label="${esc(c.name)} 배치 해제">${this.portrait(c)}<b>${esc(c.name)}</b><small>해제 ×</small></button>`:'<div class="formation-empty-slot"><img src="'+CREST+'" alt=""><span>선택 대기</span></div>'}</div>`;
  }).join('');this.renderDetail();this.renderInventory();this.lock();
 }
 lock(){this.dialog.querySelectorAll('button,input,select').forEach(b=>{b.disabled=this.busy;});this.$('[data-apply]').disabled=this.busy||this.draft.mercenaries.length!==2||!this.draft.card;}
 setStatus(text){this.$('[data-status]').textContent=text;}
 async apply(){
  if(this.busy||this.draft.mercenaries.length!==2||!this.draft.card)return;this.busy=true;this.lock();this.setStatus('분대를 배치하고 있습니다.');
  try{await this.onApply(structuredClone(this.draft));this.busy=false;this.close();this.onToast('분대를 배치했습니다. 준비를 완료해 주세요.');}
  catch(e){this.setStatus(e.message);}
  finally{this.busy=false;this.lock();}
 }
}
