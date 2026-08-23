(()=>{
  const cards=[...document.querySelectorAll('.merc-card')];
  const dossier=document.getElementById('contractDossier');
  const fields={
    code:document.getElementById('detailCode'),name:document.getElementById('detailName'),title:document.getElementById('detailTitle'),
    role:document.getElementById('detailRole'),weapon:document.getElementById('detailWeapon'),effect:document.getElementById('detailEffect'),desc:document.getElementById('detailDesc')
  };
  const rankField=document.getElementById('detailRank');
  const select=card=>{
    cards.forEach(item=>item.classList.toggle('selected',item===card));
    Object.entries(fields).forEach(([key,node])=>{node.textContent=card.dataset[key]||''});
    if(rankField)rankField.textContent=`${card.dataset.rank||'C'} 랭크`;
    dossier.style.setProperty('--detail-accent',getComputedStyle(card).getPropertyValue('--accent').trim());
  };
  cards.forEach((card,index)=>{
    card.addEventListener('click',()=>select(card));
    card.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const direction=event.key==='ArrowRight'?1:-1;
      const next=cards[(index+direction+cards.length)%cards.length];
      next.focus();select(next);
    });
    card.addEventListener('pointermove',event=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const rect=card.getBoundingClientRect();
      const x=(event.clientX-rect.left)/rect.width;
      const y=(event.clientY-rect.top)/rect.height;
      card.style.setProperty('--ry',`${(x-.5)*8}deg`);
      card.style.setProperty('--rx',`${(.5-y)*7}deg`);
      card.style.setProperty('--mx',`${x*100}%`);card.style.setProperty('--my',`${y*100}%`);
    });
    card.addEventListener('pointerleave',()=>{card.style.setProperty('--ry','0deg');card.style.setProperty('--rx','0deg')});
  });
  if(cards[0])select(cards[0]);
})();
