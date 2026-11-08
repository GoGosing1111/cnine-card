/* Common sockets belong to physical equipment instances. The server provider supplies rune identity and options. */
(() => {
 'use strict';
 const UI='/assets/ui/character-runes/v1/';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const percent=bp=>(Number(bp||0)/100).toLocaleString('ko-KR')+'%';
 const word=(id,alt)=>`<img class="crs-wordmark" src="${UI}label-${id}.webp" alt="${alt}">`;
 const modeLabel=r=>r.mode==='COMMON'?'PVE·PVP 공용':r.mode;
 const texture=r=>`--crs-rune-fx:url('${esc(r.visual?.image||'')}');--crs-rune-color:${esc(r.visual?.color||'#d6e4ef')}`;
 function create(options){
  const vfx=window.ItemRuneVFX?.create();
  let data=null,selectedId=0,busy=false,error='',destroyed=false,generation=0,dialog=null;
  const pending=()=>{try{return JSON.parse(sessionStorage.getItem(options.pendingKey)||'null');}catch{return null;}};
  const clearPending=id=>{if(pending()?.body?.requestId===id)sessionStorage.removeItem(options.pendingKey);};
  const active=id=>data?.enabled&&canSocket(options.getInstance?.(Number(id))?.item?.slot)?data.catalog?.find(r=>r.owned&&r.code===data.placements?.[id]):null;
  const placement=code=>Object.entries(data?.placements||{}).find(([,c])=>c===code)?.[0];
  const repaint=()=>{if(destroyed)return;options.onRender?.();renderDialog();};
  const frame=r=>`<img class="crs-socket-frame" src="${UI}socket-empty.webp" alt="" width="384" height="384">${r?`<img class="crs-socket-rune" src="${esc(r.image)}" alt="">`:''}`;
  const canSocket=slot=>['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'].includes(slot);
  function socket(row,slot=row?.item?.slot){
   if(!canSocket(slot))return '';
   if(data?.enabled===false&&!error)return '';
   const id=Number(row?.instanceId||0),r=active(id),loading=!data&&!error;
   const label=`${row?.item?.name||'빈 장비 칸'} · ${r?r.name+' / '+modeLabel(r)+' '+r.effect.label+' +'+percent(r.valueBp):'빈 공용 룬 소켓'}`;
   const attrs=`class="crs-item-socket ${r?'is-filled':'is-empty'}" data-rune-socket="ITEM_RUNE" data-rune-tone="${esc(r?.visual?.tone||'neutral')}" ${r?`style="${texture(r)}"`:''}`;
   if(!id)return `<span ${attrs} aria-hidden="true">${frame(null)}</span>`;
   return `<button type="button" ${attrs} data-rune-instance="${id}" aria-label="${esc(label)}" title="${esc(label)}" ${loading?'disabled':''}>${frame(r)}</button>`;
  }
  function caption(row){
   const r=active(row?.instanceId);if(!r)return '';
   return `<small class="crs-item-option" data-item-rune-option="${Number(row.instanceId)}" title="${esc(r.name+' · '+modeLabel(r)+' '+r.effect.label+' +'+percent(r.valueBp))}">${r.mode==='COMMON'?'공용 룬':esc(r.mode)+' '+(r.effect.stat==='attackBp'?'공격':'체력')} +${percent(r.valueBp)}</small>`;
  }
  function optionPanel(){
   if(data?.enabled===false&&!error)return '';
   return `<section class="crs-options" aria-label="착용 장비 룬 옵션">${word('options','룬 공명 옵션')}<b class="crs-active-count">착용 ${data?.activeCount||0} / 5</b>${['PVE','PVP'].map(mode=>{
    const b=data?.bonuses?.[mode]||{},value=mode==='PVE'?b.attackBp:b.hpBp;
    return `<div class="crs-option ${value?'is-active':''}" data-rune-option="${mode}"><span>${mode}</span><div><b>${mode==='PVE'?'카드·용병 공격력':'랭크전 최대 체력'}</b><strong>${value?'+'+percent(value):'비활성'}</strong></div></div>`;
   }).join('')}<p>${error?'룬 정보를 다시 확인해 주세요.':'일반 장비 다섯 부위의 룬 효과를 합산합니다. 배틀슈트에는 소켓이 없습니다.'}</p></section>`;
  }
  function fx(row){
   const r=active(row?.instanceId);if(!r?.visual?.image)return '';
   if(window.ItemRuneVFX?.supports(r.visual.animation))return `<canvas class="crs-item-energy crs-live-energy" data-rune-animation="${esc(r.visual.animation)}" data-rune-effect="${esc(r.code)}" data-rune-effect-instance="${Number(row.instanceId)}" aria-hidden="true"></canvas>`;
   return `<span class="crs-item-energy" data-rune-effect="${esc(r.code)}" data-rune-effect-instance="${Number(row.instanceId)}" data-rune-tone="${esc(r.visual.tone)}" style="${texture(r)}" aria-hidden="true"><i></i></span>`;
  }
  function artSource(row){
   const skin=active(row?.instanceId)?.visual?.skin;
   const path=String(row?.item?.image||'').replace(/\\/g,'/').replace(/^\.?\//,'').split(/[?#]/)[0];
   return skin?.equipmentLayers?.[path]||null;
  }
  function artAttributes(row){
   const skin=active(row?.instanceId)?.visual?.skin;
   if(!skin)return '';
   return `data-rune-skin="${esc(skin.id)}" data-rune-cutout="${Boolean(artSource(row))}" style="--crs-metal-mask:url('${esc(skin.frame)}')"`;
  }
  function layers(row){
   const skin=active(row?.instanceId)?.visual?.skin;if(!skin)return '';
   return `<img class="crs-item-backplate" src="${esc(skin.background)}" alt="" aria-hidden="true"><span class="crs-item-frame" aria-hidden="true"></span><span class="crs-metal-sheen" aria-hidden="true"></span>`;
  }
  function renderDialog(){
   if(!dialog?.open)return;
   const p=pending(),rune=active(selectedId),item=options.getInstance?.(selectedId);
   dialog.innerHTML=`<header>${word('selection','룬 선택')}<button type="button" class="crs-close" data-rune-close aria-label="닫기">×</button></header>
    <div class="crs-target-item"><div class="crs-target-art" ${artAttributes(item)}>${layers(item)}<img class="crs-target-equipment" src="${esc(artSource(item)||item?.item?.image||'')}" alt="">${fx(item)}${socket(item)}</div><div><small>장비별 공용 소켓 · 1칸</small><h2>${esc(item?.item?.name||'선택한 장비')}</h2><p>${rune?esc(rune.name):'비어 있는 소켓'}<br>${data?.equippedInstances?.includes(selectedId)?'착용 중 · 룬 옵션 활성화 가능':'보관 중 · 착용 시 룬 옵션 활성화'}</p></div></div>
    <p class="crs-dialog-intro">이 아이템에 넣을 룬을 선택하세요. 다른 장비의 룬을 선택하면 이 장비로 이동합니다.</p>
    <div class="crs-rune-list">${(data?.catalog||[]).map(r=>{
     const id=placement(r.code),other=id&&Number(id)!==selectedId,otherName=other?options.getInstance?.(Number(id))?.item?.name:null;
     return `<article class="crs-rune-card ${rune?.code===r.code?'is-equipped':''}"><img class="crs-choice-image" src="${esc(r.image)}" alt=""><div><small>${esc(r.source||'룬')} · ${esc(modeLabel(r))}</small><h3>${esc(r.name)}${r.copy?' · '+r.copy+'번':''}</h3><p>${esc(r.effect.label)} <strong>+${percent(r.valueBp)}</strong></p><span>${!r.owned?'미보유':other?esc(otherName||'다른 장비')+'에 삽입됨':rune?.code===r.code?'이 장비에 삽입됨':r.upgraded?'강화된 룬 · 보유 중':'보유 중'}</span></div><button type="button" class="crs-action" data-rune-equip="${esc(r.code)}" ${busy||!r.owned||rune?.code===r.code||p?'disabled':''}>${rune?.code===r.code?'삽입 중':!r.owned?'미보유':other?'이 장비로 이동':word('equip','장착하기')}</button></article>`;
    }).join('')||'<p class="crs-no-runes">표시할 룬이 없습니다.</p>'}</div>
    ${rune?`<button type="button" class="crs-action crs-remove" data-rune-remove ${busy||p?'disabled':''}>${word('unequip','장착 해제')}</button>`:''}
    <p class="crs-feedback" role="status" aria-live="polite">${busy?'장비의 룬 상태를 저장하고 있습니다.':esc(error)}</p>
    ${p?`<p class="crs-pending">완료 여부를 확인할 이전 요청이 있습니다.</p>${p.action==='socket'?'<button type="button" class="crs-action" data-rune-retry '+(busy?'disabled':'')+'>이전 요청 확인</button>':'<a class="crs-source-link" href="'+esc(options.sourceHref)+'">제작소에서 이전 요청 확인</a>'}`:''}
    <footer><button type="button" class="crs-refresh" data-rune-refresh ${busy?'disabled':''}>새로고침</button>${options.sourceHref?`<a class="crs-source-link" href="${esc(options.sourceHref)}">룬 획득·강화</a>`:''}<span>PVE·PVP 공용 · 착용한 룬 최대 5개의 효과가 합산됩니다.<br>룬 1개는 장비 1개에만 삽입할 수 있으며, 빼거나 옮겨도 소모되지 않습니다.</span></footer>`;
   vfx?.mount(dialog);
  }
  function open(id){
   if(!canSocket(options.getInstance?.(id)?.item?.slot)||dialog?.open)return;selectedId=id;
   dialog=document.createElement('dialog');dialog.className='crs-dialog';dialog.setAttribute('aria-label','장비 공용 룬 소켓');
   dialog.addEventListener('click',e=>{const target=e.target.closest('button');if(target)handleClick(target);});
   dialog.addEventListener('close',()=>{dialog?.remove();dialog=null;options.onFocusSocket?.(selectedId);},{once:true});
   document.body.append(dialog);dialog.showModal();renderDialog();dialog.querySelector('[data-rune-close]')?.focus();
  }
  async function load(){
   if(busy||destroyed)return;const turn=++generation;
   try{const next=await options.read();if(destroyed||turn!==generation)return;data=next;error='';}
   catch(e){if(destroyed||turn!==generation)return;error=e.message||'룬 정보를 불러오지 못했습니다.';}
   repaint();
  }
  async function equip(code,retry=false){
   if(busy||destroyed)return;let record=pending();
   if(record&&(!retry||record.action!=='socket')){error='이전 요청을 먼저 확인해 주세요.';repaint();return;}
   if(!record){
    if(!canSocket(options.getInstance?.(selectedId)?.item?.slot)||(code!==null&&!data?.catalog?.some(r=>r.code===code&&r.owned)))return;
    record={action:'socket',body:{instanceId:selectedId,code,requestId:crypto.randomUUID()}};
    try{sessionStorage.setItem(options.pendingKey,JSON.stringify(record));}catch{error='요청을 저장할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.';repaint();return;}
   }
   busy=true;error='';const turn=++generation;repaint();
   try{
    const response=await options.equip(record.body);clearPending(record.body.requestId);
    if(destroyed||turn!==generation)return;
    data=await options.read();if(destroyed||turn!==generation)return;options.onChange?.(data,response);
   }catch(e){
    if([400,403,404].includes(e.status)||['SEASON_CONDITION','SEASON_REQUEST_CONFLICT'].includes(e.code))clearPending(record.body.requestId);
    if(destroyed||turn!==generation)return;error=e.message||'장비의 룬 상태를 확인하지 못했습니다.';
   }finally{if(!destroyed&&turn===generation){busy=false;repaint();}}
  }
  function handleClick(target){
   if(target.hasAttribute('data-rune-instance'))open(Number(target.dataset.runeInstance));
   else if(target.hasAttribute('data-rune-close'))dialog?.close();
   else if(target.hasAttribute('data-rune-equip'))void equip(target.dataset.runeEquip);
   else if(target.hasAttribute('data-rune-remove'))void equip(null);
   else if(target.hasAttribute('data-rune-retry'))void equip(null,true);
   else if(target.hasAttribute('data-rune-refresh')){if(!busy)void load();}
   else return false;return true;
  }
  return {socket,caption,optionPanel,fx,layers,artSource,artAttributes,load,handleClick,mount:host=>vfx?.mount(host),getState:()=>data&&structuredClone(data),destroy(){destroyed=true;generation++;dialog?.close();dialog?.remove();dialog=null;vfx?.destroy();}};
 }
 window.CharacterRuneSockets=Object.freeze({create});
})();
