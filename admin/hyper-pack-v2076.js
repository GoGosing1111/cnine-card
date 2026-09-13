// The old four-field draft is retained as history in DB. Live opening uses the
// versioned mercenary draw CMS, including all six grades and duplicate rules.
(()=>{
 let panel;
 function mount(){const target=document.getElementById('packManager');if(!target||panel)return;
  panel=document.createElement('section');panel.id='hyperPackAdmin';
  panel.innerHTML='<div class="hyper-admin-top"><div><small>EXTREME HYPER PACK / LIVE CONNECTION</small><h3>하이퍼팩 · 용병카드 개봉</h3><p>1회 <b>5억 코인</b> · 최대 10회 <b>50억 코인</b><br>꽝 · 마스터의 별 · 미스틱 에너지 · C~SSS 용병카드</p></div><img src="/assets/ui/packs/hyper-pack-v2076.png" alt="하이퍼팩"></div><p>실제 개봉은 용병 운영실에 저장된 등급별 확률·지급 수량을 사용합니다. 같은 등급은 균등 추첨하며, 중복은 카드별로 집계합니다. 이전 4종 확률 초안은 운영 추첨에 사용하지 않습니다.</p><div class="hyper-admin-actions"><a href="#mercenaries/draw">운영 개봉 확률 설정</a><a href="/?screen=buy&amp;pack=hyper" target="_blank" rel="noopener">실제 카드팩 상점 ↗</a><a href="/mercenary-hangar/" target="_blank" rel="noopener">용병 지휘소 ↗</a></div><div data-hyper-opening></div>';
  target.before(panel);void import('./hyper-pack-opening.mjs?v=2097').then(m=>m.mountHyperOpening());
 }
 mount();if(!panel)new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
