(() => {
  const queue=[]; let running=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function play(reward){
    const code=String(reward.itemCode||'NORMAL_CUBE'),tier=code==='PREMIUM_CUBE'?'premium':code==='ADVANCED_CUBE'?'advanced':'normal';
    const el=document.createElement('div'); el.className=`cube-drop-cinematic ${tier}`;
    el.innerHTML=`<div class="cube-drop-space"><i class="cube-drop-wave w1"></i><i class="cube-drop-wave w2"></i><div class="cube-drop-particles"></div><div class="cube-drop-object"><span></span><img src="${esc(reward.image||'')}" alt="${esc(reward.name)}"></div><div class="cube-drop-copy"><small>${esc(reward.source)} BATTLE REWARD</small><h2>큐브 획득</h2><strong>${esc(reward.name)} × ${Number(reward.quantity||1)}</strong><p>인벤토리에 보관되었습니다 · 보유 ${Number(reward.balance||0).toLocaleString()}개</p></div></div>`;
    document.body.appendChild(el); requestAnimationFrame(()=>el.classList.add('show'));
    await new Promise(r=>setTimeout(r,tier==='premium'?2800:2300)); el.classList.add('out'); await new Promise(r=>setTimeout(r,450)); el.remove();
  }
  async function drain(){if(running)return;running=true;while(queue.length){const {reward,resolve}=queue.shift();try{await play(reward)}finally{resolve()}}running=false}
  window.showCubeDropAcquisition=reward=>new Promise(resolve=>{queue.push({reward,resolve});drain()});
})();
