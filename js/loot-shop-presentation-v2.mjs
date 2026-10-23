import {LOOT_CATEGORIES,LOOT_LIMIT_PERIODS,LOOT_PRODUCT_TYPES,PIG_COIN_IMAGE,lootProductCategory,lootIsDirect,lootMercenaryRanks} from '../shared/loot-shop-policy-v1.mjs?v=20261023-renewal-v1';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=v=>Number(v||0).toLocaleString('ko-KR');
export function lootShopAsset(value){
 try{const url=new URL(String(value||''),'https://local.invalid');if(url.origin==='https://raw.githubusercontent.com'){const m=url.pathname.match(/^\/GoGosing1111\/cnine-card\/[A-Za-z0-9._-]+(\/assets\/.+)$/);return m?m[1]:'';}return url.origin==='https://local.invalid'&&url.pathname.startsWith('/assets/')?url.pathname:'';}catch{return '';}
}
export const descriptions={SUPERSTAR_CHOICE:'등록된 SUPERSTAR 카드 중 원하는 카드 1장 선택',FUR_CHOICE:'등록된 FUR 카드 중 원하는 카드 1장 선택',F_BODY:'F바디 장비 1개 확정 지급',MYSTIC_EQUIPMENT:'미스틱 4종 중 각 25%로 장비 1개 랜덤 지급 · 꽝 없음',MERCENARY_PACK:'등록된 A·S등급 용병 중 카드 1장 획득',MERCENARY_SS_PACK:'SS등급 용병 1장 확정 · 등록된 후보에서 균등 추첨',ITEM_BUNDLE:'아래 구성의 아이템을 모두 인벤토리로 지급합니다.',EQUIPMENT_DIRECT:'선택된 장비 1개를 장비 보관함으로 지급합니다.',CARD_CHOICE:'등록된 카드 중 원하는 카드 1장을 직접 선택합니다.',MERCENARY_CUSTOM_PACK:'설정된 등급 확률에 따라 등록된 용병 1장을 획득합니다.'};
const pack='assets/ui/packs/reverse-call-20261016/';
const categoryArt={SUPERSTAR_CHOICE:pack+'superstar-768.webp',FUR_CHOICE:pack+'limited-768.webp',CARD_CHOICE:pack+'limited-768.webp',F_BODY:'assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v1.png',MYSTIC_EQUIPMENT:'assets/ui/packs/prime-armory-equipment-box-v1.png',EQUIPMENT_DIRECT:'assets/ui/packs/prime-armory-equipment-box-v1.png',MERCENARY_PACK:pack+'hyper-768.webp',MERCENARY_SS_PACK:pack+'hyper-768.webp',MERCENARY_CUSTOM_PACK:pack+'hyper-768.webp',ITEM_BUNDLE:'assets/ui/packs/prime-armory-equipment-box-v1.png'};
export const productArt=p=>lootShopAsset(p.image)||lootShopAsset(categoryArt[p.type]);
export const productDescription=p=>p.description||descriptions[p.type]||'';
export const kstDate=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
export function mercenaryOdds(product){
 if(product.type==='MERCENARY_SS_PACK')return 'SS등급 100%';
 const weights=product.type==='MERCENARY_CUSTOM_PACK'?product.rankWeights:product.mercenaryWeights,total=Object.values(weights||{}).reduce((a,b)=>a+Number(b||0),0);
 return total?lootMercenaryRanks(product.type).filter(r=>weights[r]>0).map(r=>`${r}등급 ${(weights[r]/total*100).toFixed(2)}%`).join(' · '):'등급 확률 설정 예정';
}
export function lootProductOptionsMarkup(p){
 const mystic=p.type==='MYSTIC_EQUIPMENT',bundle=p.type==='ITEM_BUNDLE',gear=mystic||p.type==='EQUIPMENT_DIRECT'||p.type==='F_BODY',mercenary=lootMercenaryRanks(p.type).length>0;
 const note=bundle?'구성된 모든 아이템을 표시 수량만큼 지급합니다.':mystic?'미스틱 4종 중 각 25%로 1개를 받습니다. 꽝은 없으며 이미 보유한 장비도 나올 수 있습니다.':gear?'아래 장비 1개를 확정 지급합니다.':mercenary?mercenaryOdds(p)+' · 등급 내 균등 추첨. 이미 보유한 용병도 나올 수 있습니다.':'개봉 시 아래 카드 중 1장을 직접 선택합니다. 한정 카드의 잔여 수량에 따라 목록이 달라질 수 있습니다.';
 return `<h2>${esc(p.name)} 구성</h2><p class="loot-dialog-copy">${note}</p><div class="loot-choice-grid ${gear||bundle?'loot-equipment-pool':''}">${(p.options||[]).map(c=>`<div class="loot-choice">${lootShopAsset(c.image)?`<img src="${esc(lootShopAsset(c.image))}" alt="" loading="lazy">`:''}<span>${esc(c.name)}<br><b>${esc(mystic?c.rarity+' · '+c.chancePercent+'%':bundle?'× '+fmt(c.quantity):c.rank||c.grade||c.rarity||'장비')}</b></span></div>`).join('')}</div>`;
}
export function lootRewardMarkup(reward){
 if(reward.kind==='BUNDLE')return `<h2>획득 완료</h2><p class="loot-dialog-copy">${esc(reward.name)} · 인벤토리에 지급되었습니다.</p><ul class="loot-result-items">${reward.items.map(i=>`<li>${lootShopAsset(i.image)?`<img src="${esc(lootShopAsset(i.image))}" alt="">`:''}<span>${esc(i.name)}</span><b>× ${fmt(i.quantity)}</b></li>`).join('')}</ul>`;
 const image=lootShopAsset(reward.image),equipment=reward.kind==='EQUIPMENT';return `<h2>획득 완료</h2>${image?`<img class="loot-result" src="${esc(image)}" alt="">`:''}<p class="loot-dialog-copy"><strong>${esc(reward.name)}</strong><br>${equipment?'장비 1개를 획득했습니다.<br>장비 보관함에서 확인할 수 있습니다.':esc(reward.rank||reward.grade)+' 카드 1장을 획득했습니다.'}</p>`;
}
export function productStatus(p){
 if(p.saleState==='SCHEDULED')return '판매 예정';if(p.saleState==='ENDED')return '판매 종료';
 if(!p.enabled||p.remaining===null)return '교환 준비 중';if(p.remaining===0)return '한도 소진';return `${LOOT_LIMIT_PERIODS[p.limitPeriod||'LIFETIME']} ${fmt(p.remaining)}회 남음`;
}
export function productMarkup(p,selected=false){return `<button class="loot-product" type="button" data-select="${esc(p.id)}" aria-pressed="${selected}"><span class="loot-product-art"><img class="loot-product-thumb" src="${esc(productArt(p))}" alt="" loading="lazy">${p.badge||p.featured?`<span class="loot-product-badge">${esc(p.badge||'추천')}</span>`:''}</span><span class="loot-product-type">${esc(LOOT_CATEGORIES[lootProductCategory(p)])}</span><span class="loot-product-title">${esc(p.name)}</span><span class="loot-product-price">${p.price===null?'<span class="unset">가격 설정 예정</span>':`<img src="/${PIG_COIN_IMAGE}" alt="피그 코인">${fmt(p.price)}`}</span><span class="loot-product-meta ${p.canBuy?'ready':''}">${esc(productStatus(p))}</span></button>`;}
export function inspectionMarkup(p,state){
 const choice=p.type.endsWith('_CHOICE'),direct=lootIsDirect(p.type),period=p.limitPeriod||'LIFETIME',ready=state.salesEnabled&&p.enabled;
 const label=p.saleState==='SCHEDULED'?'판매 시작 전':p.saleState==='ENDED'?'판매 종료':p.remaining===0?'구매 한도 소진':!ready?'교환 준비 중':p.canBuy?'교환하기':state.pigCoins<p.price?'피그 코인 부족':'현재 교환 불가';
 const hint=!ready?'판매가 시작되면 교환할 수 있습니다.':p.canBuy?'교환 내용을 확인한 뒤 피그 코인이 차감됩니다.':p.remaining===0&&p.limitResetsAt?`${kstDate(p.limitResetsAt)}부터 다시 교환할 수 있습니다.`:'상품의 판매 기간과 남은 횟수를 확인하세요.';
 const detail=p.type==='ITEM_BUNDLE'?`${p.items?.length||0}종 모두 지급`:p.type==='MYSTIC_EQUIPMENT'?'4종 각 25% · 장비 1개':choice?'카드 1장 직접 선택':direct?'장비 1개 확정 지급':'용병 카드 1장';
 return `<div class="loot-detail"><p class="loot-detail-label">${esc(p.badge||LOOT_PRODUCT_TYPES[p.type])}</p><h2>${esc(p.name)}</h2><p class="loot-detail-description">${esc(productDescription(p))}</p><div class="loot-stage" data-type="${esc(p.type)}"><img class="loot-stage-art" src="${esc(productArt(p))}" alt="${esc(p.name)}"></div><dl class="loot-detail-dl"><div><dt>획득 방식</dt><dd>${detail}</dd></div><div><dt>${LOOT_LIMIT_PERIODS[period]} 구매 한도</dt><dd>${p.accountLimit===null?'설정 예정':fmt(p.accountLimit)+'회'}</dd></div><div><dt>남은 교환 횟수</dt><dd>${p.remaining===null?'설정 예정':fmt(p.remaining)+'회'}</dd></div>${p.startsAt||p.endsAt?`<div><dt>판매 기간</dt><dd>${p.startsAt?kstDate(p.startsAt):'상시'}<br>~ ${p.endsAt?kstDate(p.endsAt):'종료일 없음'} (한국 시간)</dd></div>`:''}</dl><p class="loot-detail-note">${period==='LIFETIME'?'구매 횟수는 계정에 누적됩니다.':`${LOOT_LIMIT_PERIODS[period]} 한도 · ${kstDate(p.limitResetsAt)} 초기화 (한국 시간)`}<br>${direct?p.type==='ITEM_BUNDLE'?'교환 즉시 인벤토리로 지급됩니다.':'교환 즉시 장비 보관함으로 지급됩니다.':'교환한 팩은 내 보관 팩에서 개봉할 수 있습니다.'}</p>${p.options?.length?`<button class="loot-pool-button" data-options="${esc(p.id)}">${choice?'선택 카드':direct?'지급 구성':'용병·확률'} 보기 (${p.options.length}종) ↗</button>`:''}<div class="loot-purchase-panel"><div class="loot-cost"><span>필요 피그 코인</span><strong class="${p.price===null?'unset':''}">${p.price===null?'가격 설정 예정':`<img src="/${PIG_COIN_IMAGE}" alt="">${fmt(p.price)}`}</strong></div><button class="loot-buy" data-buy="${esc(p.id)}" ${p.canBuy?'':'disabled'}>${label}</button><p class="loot-purchase-hint">${hint}</p></div></div>`;
}
export function filterLootProducts(products,{search='',category='ALL',available=false,sort='recommended'}={}){
 const query=search.trim().toLocaleLowerCase('ko-KR');const list=products.filter(p=>(category==='ALL'||lootProductCategory(p)===category)&&(!available||p.canBuy)&&(!query||[p.name,p.description,...(p.options||[]).map(o=>o.name)].join(' ').toLocaleLowerCase('ko-KR').includes(query)));
 return list.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):sort==='price-low'?(a.price??Infinity)-(b.price??Infinity)||a.sortOrder-b.sortOrder:sort==='price-high'?(b.price??-1)-(a.price??-1)||a.sortOrder-b.sortOrder:Number(!!b.featured)-Number(!!a.featured)||a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
}
