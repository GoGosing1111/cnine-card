const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=p=>'/'+String(p).replace(/^\//,'');
let data,selected,filter='ALL',visible=[],background='dark',size=460,flipped=false;
const previous=e=>e.previousNames?.join(' / ')||({MADARA:'마다라',LICH_KING:'리치왕',CORE_PROTOCOL:'유하바하'})[e.raidCode]||'레이드';
const category=e=>e.scope==='RAID'?'RAID':e.tabs.join(' / ');
function matches(e){return(filter==='ALL'||(filter==='RAID'?e.scope==='RAID':filter==='HELL'?e.tabs.some(t=>['HELL','NIGHTMARE'].includes(t)):e.tabs.includes(filter)))&&[e.workingName,previous(e),e.key].join(' ').toLowerCase().includes($('#search').value.trim().toLowerCase())}
function render(){
visible=data.entries.filter(matches);
if(!visible.some(e=>e.key===selected))selected=visible[0]?.key;
$('#visible-count').textContent=visible.length+'종';
$('#roster').innerHTML=visible.length?visible.map(e=>'<button class="tile" data-key="'+esc(e.key)+'" aria-current="'+(selected===e.key)+'"><span class="idx">'+String(data.entries.indexOf(e)+1).padStart(2,'0')+'</span><span class="thumb"><img src="'+esc(url(e.battleSprite.path))+'" loading="lazy" decoding="async" alt="'+esc(e.workingName)+' SD" width="'+e.battleSprite.width+'" height="'+e.battleSprite.height+'"></span><b>'+esc(e.workingName)+'</b><small>'+esc(previous(e))+'</small></button>').join(''):'<p class="empty">검색 결과가 없습니다.</p>';
for(const b of $('#roster').querySelectorAll('button'))b.onclick=()=>{selected=b.dataset.key;render();$('#inspector').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'})};
renderStage();
}
function renderStage(){
const e=visible.find(e=>e.key===selected);
if(!e){$('#inspector').innerHTML='<p class="empty">다른 분류나 검색어를 선택해 주세요.</p>';return}
history.replaceState(null,'','#'+e.key);
$('#inspector').innerHTML='<div class="stage-head"><div><span class="tag">'+esc(category(e))+' / '+String(data.entries.indexOf(e)+1).padStart(2,'0')+'</span><h2>'+esc(e.workingName)+'</h2><p>'+esc(previous(e))+'의 새 오리지널 디자인 · 이름 가칭</p></div><div class="stage-arrows"><button data-prev aria-label="이전 SD">←</button><button data-next aria-label="다음 SD">→</button></div></div>'+
'<div class="comparison"><figure class="source-panel"><figcaption>승인 원화<span>APPROVED ORIGINAL</span></figcaption><button class="source-frame" data-zoom="'+esc(url(e.sourceArt.path))+'" aria-label="승인 원화 확대"><img src="'+esc(url(e.sourceArt.path))+'" alt="'+esc(e.workingName)+' 승인 원화" width="'+e.sourceArt.width+'" height="'+e.sourceArt.height+'"></button></figure>'+
'<figure class="sprite-panel"><figcaption>V3 전투 SD<span>BASE SPRITE / TRANSPARENT</span></figcaption><button class="sprite-frame" data-background="'+background+'" data-zoom="'+esc(url(e.battleSprite.path))+'" aria-label="SD 원본 확대" style="--sprite-size:'+size+'px;--flip:'+(flipped?-1:1)+'"><img src="'+esc(url(e.battleSprite.path))+'" alt="'+esc(e.workingName)+' SD" width="'+e.battleSprite.width+'" height="'+e.battleSprite.height+'"></button></figure></div>'+
'<div class="toolbar"><span>배경</span><button data-bg="dark" aria-pressed="'+(background==='dark')+'">전장</button><button data-bg="checker" aria-pressed="'+(background==='checker')+'">투명 확인</button><button data-bg="light" aria-pressed="'+(background==='light')+'">밝게</button><label>크기 <input id="spriteSize" type="range" min="100" max="500" step="10" value="'+size+'"><output id="sizeOutput">'+size+' px</output></label><button id="battleSize">전투 크기 160</button><button id="flip" aria-pressed="'+flipped+'">좌우 보기</button></div>'+
'<div class="stage-bottom"><span>'+e.battleSprite.width+' × '+e.battleSprite.height+' · 투명 PNG · 기본 전신 1장<br>원화 승인 완료 / SD 검수용</span><div class="links"><a href="'+esc(url(e.battleSprite.path))+'" download>SD 원본 저장 ↓</a><a href="'+esc(url(e.sourceArt.path))+'" target="_blank" rel="noopener">승인 원화 ↗</a><a href="'+esc(e.prompt)+'" target="_blank" rel="noopener">제작 기록 ↗</a></div></div>';
$('[data-prev]').onclick=()=>move(-1);$('[data-next]').onclick=()=>move(1);
for(const b of document.querySelectorAll('[data-bg]'))b.onclick=()=>{background=b.dataset.bg;$('.sprite-frame').dataset.background=background;for(const v of document.querySelectorAll('[data-bg]'))v.setAttribute('aria-pressed',String(v===b))};
const setSize=v=>{size=Number(v);$('#spriteSize').value=size;$('#sizeOutput').value=size+' px';$('.sprite-frame').style.setProperty('--sprite-size',size+'px')};
$('#spriteSize').oninput=e=>setSize(e.target.value);$('#battleSize').onclick=()=>setSize(160);
$('#flip').onclick=e=>{flipped=!flipped;e.currentTarget.setAttribute('aria-pressed',String(flipped));$('.sprite-frame').style.setProperty('--flip',flipped?-1:1)};
for(const b of document.querySelectorAll('[data-zoom]'))b.onclick=()=>{const d=$('#zoom');d.querySelector('img').src=b.dataset.zoom;d.showModal()};
}
function move(step){if(!visible.length)return;selected=visible[(visible.findIndex(e=>e.key===selected)+step+visible.length)%visible.length].key;render()}
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const v of document.querySelectorAll('[data-filter]'))v.setAttribute('aria-pressed',String(v===b));render()};
$('#search').oninput=render;
document.addEventListener('keydown',e=>{if($('#zoom').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}if(e.key==='ArrowRight'){e.preventDefault();move(1)}});
try{const r=await fetch('manifest.json',{cache:'no-store'});if(!r.ok)throw Error('manifest '+r.status);data=await r.json();$('#count').textContent=data.entries.length;selected=data.entries.find(e=>e.key===location.hash.slice(1))?.key||data.entries[0]?.key;render()}catch(error){$('#inspector').textContent='SD 목록을 불러오지 못했습니다. 새로고침해 주세요.';console.error(error)}
