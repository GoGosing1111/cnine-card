const $=id=>document.getElementById(id);
const manifest=await fetch('./manifest.json').then(r=>{if(!r.ok)throw Error('용병 명세를 불러오지 못했습니다.');return r.json()});
const cards=manifest.cards;
const names={'diim-nurse':'올리브빛 치유','heeya-nurse':'라벤더빛 치유','joeun-nurse':'푸른빛 치유','bongsun-nurse':'붉은빛 치유'};
$('nurses').innerHTML=cards.map(c=>`<button class="nurse" type="button" data-code="${c.code}" aria-pressed="false"><img src="/${c.previewArt}" alt=""><span><b>${c.name}</b><small>${names[c.id]}</small></span></button>`).join('');
$('allArt').innerHTML=cards.map(c=>`<figure><a class="framed" style="display:block" href="/${c.sourceArt}" target="_blank" rel="noopener"><img src="/${c.previewArt}" alt="${c.name} 원화"><img class="frame" src="/assets/ui/card-frames/mercenary-contract-frame-premium-v2.png" alt=""></a><figcaption><span>${c.name}</span><b>SS · 힐러</b></figcaption></figure>`).join('');
$('frames').innerHTML=manifest.skill.frames.map(f=>`<a href="/${f.file}" target="_blank" rel="noopener"><img loading="lazy" src="/${f.file}" alt="백의의 맹세 ${f.index+1} 프레임"><span>${String(f.index+1).padStart(2,'0')}</span></a>`).join('');
function select(code){
 const c=cards.find(c=>c.code===code);if(!c)return;
 window.nurseSelection=code;
 $('name').textContent=c.name;$('specialty').textContent=names[c.id];$('description').textContent=c.description;
 $('art').src='/'+c.previewArt;$('art').alt=c.name+' 간호사 원화';$('sd').src='/'+c.battleSprite;$('sd').alt=c.name+' 전투 SD';
 $('artLink').href='/'+c.sourceArt;$('sourceDownload').href='/'+c.sourceArt;$('sdDownload').href='/'+c.battleSprite;
 document.documentElement.style.setProperty('--nurse',c.accent);
 document.querySelectorAll('[data-code]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.code===code)));
 window.dispatchEvent(new CustomEvent('nurse-selected',{detail:code}));
}
$('nurses').addEventListener('click',e=>{const b=e.target.closest('[data-code]');if(b)select(b.dataset.code)});
$('background').onclick=()=>{const light=$('sdStage').classList.toggle('light');$('background').textContent=light?'어두운 배경':'밝은 배경';$('background').setAttribute('aria-pressed',String(light));};
select(cards[0].code);
