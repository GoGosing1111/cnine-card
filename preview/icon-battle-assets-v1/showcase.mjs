import {ICON_CMS_CATALOG} from '../../shared/icon-cms-catalog-v1.mjs';
import {createIconCard} from '../../js/icon-card-v1.mjs';

// Presentation only. The existing V3 iframe owns selection and the FX clock.
// No API, saved deck, economy setting or additional renderer is created here.
const descriptions={
  diim:'청록 검광이 교차하며 파도처럼 퍼지는 쌍검 이펙트.',
  'hi-heeya':'기관총의 주황 섬광과 연속 포화가 폭발로 이어지는 이펙트.',
  'namuneul-bongsoon':'비취빛 화살과 꽃잎이 유성처럼 쏟아지는 장궁 이펙트.',
  'oh-joeun':'마이크 지팡이에서 프리즘 음파가 겹겹이 울리는 이펙트.',
  orikkung:'백화 부채의 꽃잎과 나비가 부드러운 빛으로 흩날리는 이펙트.',
  kangguyeol:'청동 건틀릿의 타격을 따라 충격파와 암석 파편이 솟는 이펙트.',
  ayoon:'백금 군도의 섬광에 함포와 푸른 물보라가 이어지는 이펙트.'
};
const $=id=>document.getElementById(id);
let shown;
function showCharacter(id){
  const card=ICON_CMS_CATALOG.find(row=>row.id===id)||ICON_CMS_CATALOG[0];
  if(shown===card.id)return;
  shown=card.id;
  document.documentElement.style.setProperty('--accent',card.accent);
  document.querySelector('.visual-panel').dataset.characterId=card.id;
  $('showcaseCode').textContent=`ICON / ${String(ICON_CMS_CATALOG.indexOf(card)+1).padStart(2,'0')}`;
  $('showcaseName').textContent=card.name;$('showcaseWeapon').textContent=card.weapon;
  $('portrait').replaceChildren(createIconCard(card));
  $('portraitOriginal').href='/'+card.sourceArt;
  $('portraitOriginal').setAttribute('aria-label',`${card.name} 카드 원본 보기`);
  $('selectedSd').src='/'+card.battleSprite;$('selectedSd').alt=`${card.name} · ${card.weapon} 전투 SD`;
  const hit=card.effects.find(effect=>effect.kind==='HIT'),skill=card.effects.find(effect=>effect.kind==='SKILL');
  $('hitName').textContent=hit.name.split(' · ').at(-1);
  $('skillName').textContent=$('signatureName').textContent=skill.name.split(' · ').at(-1);
  $('signatureDescription').textContent=descriptions[card.id];
}
document.addEventListener('icon-preview-selection',event=>showCharacter(event.detail.characterId));
showCharacter(new URL(location.href).searchParams.get('character'));
