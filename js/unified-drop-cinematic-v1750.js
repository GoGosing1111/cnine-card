(() => {
  const queue = [];
  let running = false;
  let scheduled = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => Math.max(0, Number(value || 0)).toLocaleString();
  const asset = value => {
    let path = String(value || '').trim().replace(/\\/g, '/');
    if (path && !/^(?:https?:|data:|blob:|\/)/i.test(path)) path = '/' + path.replace(/^\.\//, '');
    return path;
  };
  const tier = rarity => {
    const value = String(rarity || 'SPECIAL').toUpperCase();
    if (['MYTHIC','ZENITH','PRESTIGE','LIMITED','FUR','MA','PREMIUM'].includes(value)) return 'apex';
    if (['LEGENDARY','UNIQUE','EPIC'].includes(value)) return 'legend';
    return 'special';
  };
  const sourceName = source => ({PVE:'PVE 승리',PVE_AUTO:'자동전투 승리',PVE_NIGHTMARE:'나이트메어 승리',PVE_NIGHTMARE_AUTO:'나이트메어 자동전투',PVP:'PVP 승리',SCRAPYARD:'폐차장 완주'}[String(source || '').toUpperCase()] || '통합 드랍');
  function sound(level) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext(), master = context.createGain();
      master.gain.setValueAtTime(.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(level === 'apex' ? .13 : .08, context.currentTime + .08);
      master.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 2.2);
      master.connect(context.destination);
      [110,220,330,440,660].forEach((frequency,index) => {
        const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * .075;
        oscillator.type = index < 2 ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, start + .8);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(1 / (index + 2), start + .04);
        gain.gain.exponentialRampToValueAtTime(.0001, start + 1.4);
        oscillator.connect(gain); gain.connect(master); oscillator.start(start); oscillator.stop(start + 1.5);
      });
      setTimeout(() => context.close().catch(() => {}), 2600);
    } catch {}
  }
  async function play(reward, payload) {
    const level = tier(reward.rarity), image = asset(reward.image), quantity = Math.max(1, Number(reward.quantity || 1));
    const name = reward.displayName || reward.rewardName || reward.rewardRef || '특별 보상';
    const acquisitionTitle = reward.rewardType === 'CARD' ? '카드 획득' : reward.rewardType === 'EQUIPMENT' ? '장비 획득' : '특별 아이템 획득';
    const destination = reward.destination || (reward.rewardType === 'VEHICLE' ? '차고지' : '인벤토리');
    const balance = reward.balance == null ? `${destination}에 등록되었습니다` : `${destination} 보유 ${number(reward.balance)}개`;
    const particles = Array.from({length: 34}, (_, index) => `<i style="--i:${index};--x:${(index * 47) % 101};--d:${(index % 9) * .08}s"></i>`).join('');
    const shards = Array.from({length: 16}, (_, index) => `<b style="--i:${index}"></b>`).join('');
    const root = document.createElement('div');
    root.className = `unified-drop-cinematic ${level}`;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', `${name} 획득`);
    root.innerHTML = `<div class="udfx-void"></div><div class="udfx-aurora"></div><div class="udfx-beams"><i></i><i></i><i></i><i></i><i></i></div><div class="udfx-particles">${particles}</div><div class="udfx-stage"><div class="udfx-kicker"><span>SOOPKETMON</span><i></i><b>ULTRA DROP</b></div><div class="udfx-portal"><i></i><i></i><i></i><em></em></div><div class="udfx-shards">${shards}</div><figure class="udfx-relic"><div class="udfx-relic-glow"></div><div class="udfx-image">${image ? `<img src="${esc(image)}" alt="${esc(name)}">` : `<strong>${reward.rewardType === 'COIN' ? 'C' : reward.rewardType === 'CARD_SHARDS' ? 'S' : '◆'}</strong>`}</div><figcaption>${esc(String(reward.rarity || 'SPECIAL').toUpperCase())}</figcaption></figure><div class="udfx-copy"><small>${esc(sourceName(payload.sourceType))} · ${esc(destination.toUpperCase())}</small><h2>${esc(acquisitionTitle)}</h2><strong>${esc(name)}</strong><div><span>획득 수량</span><b>× ${number(quantity)}</b></div><p>${esc(balance)}</p></div><button type="button" class="udfx-confirm"><span>보상 확인</span><small>TOUCH TO CONTINUE</small></button></div>`;
    document.body.appendChild(root);
    const imageNode = root.querySelector('.udfx-image img');
    imageNode?.addEventListener('error', () => { imageNode.replaceWith(Object.assign(document.createElement('strong'), {textContent:'◆'})); }, {once:true});
    requestAnimationFrame(() => root.classList.add('show'));
    sound(level);
    await new Promise(resolve => {
      let resolved = false;
      const finish = () => { if (resolved) return; resolved = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(finish, 4600);
      root.querySelector('.udfx-confirm').addEventListener('click', finish);
      root.addEventListener('click', event => { if (event.target === root || event.target.classList.contains('udfx-void')) finish(); });
    });
    root.classList.add('out');
    await new Promise(resolve => setTimeout(resolve, 480));
    root.remove();
  }
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      const job = queue.shift();
      try { for (const reward of job.payload.rewards || []) await play(reward, job.payload); }
      finally { job.resolve(); }
    }
    running = false;
  }
  function schedule() {
    if (scheduled || running) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; drain(); }, 650);
  }
  window.showUnifiedDropAcquisition = payload => new Promise(resolve => {
    if (!payload?.rewards?.length) return resolve();
    queue.push({payload, resolve: () => {}});
    schedule();
    resolve();
  });
})();
