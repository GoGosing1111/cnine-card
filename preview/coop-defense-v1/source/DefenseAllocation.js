import {allocationCost, DEFENSE_TRAITS, GROWTH_BRANCHES, growthTier} from '../../../shared/monster-defense-growth-v2.mjs';

const titles = {ATTACK: '공격력', VITAL: '최대 체력', TACTIC: '전술 대기'};
const format = value => value.toLocaleString('ko-KR');
const freshDraft = () => ({ATTACK: 0, VITAL: 0, TACTIC: 0});

export class DefenseAllocation {
  constructor(send, notify) {
    this.send = send;
    this.notify = notify;
    this.draft = freshDraft();
    const root = this.root = document.createElement('dialog');
    root.className = 'allocation';
    root.setAttribute('aria-labelledby', 'allocation-title');
    root.innerHTML = `<header class="allocation-head"><div><p data-wave></p><h2 id="allocation-title">분대 성장</h2></div>
      <button type="button" data-close aria-label="전장으로 돌아가기">닫기</button></header>
      <div class="allocation-balance"><span>보유 포인트 <strong data-wallet></strong></span><small data-income></small></div>
      <div class="allocation-stats"></div><section class="allocation-traits" hidden><h3>특성 선택</h3><div data-traits></div></section>
      <p class="allocation-forecast" data-forecast></p><p class="allocation-feedback" role="status"></p>
      <footer><span class="allocation-clock">다음 공세 <strong data-clock></strong></span>
      <button type="button" data-ready>정비 완료</button><button type="button" data-apply>배분 적용</button></footer>`;
    document.body.append(root);
    this.q = selector => root.querySelector(selector);
    for (const branch of GROWTH_BRANCHES) {
      const row = document.createElement('section');
      row.className = 'allocation-row';
      row.dataset.stat = branch.id;
      row.innerHTML = `<div class="allocation-stat-name"><i class="stat-symbol" aria-hidden="true"></i><div><h3>${titles[branch.id]}</h3><small data-level></small></div></div>
        <div class="allocation-effect"><strong data-effect></strong><small data-cost></small></div>
        <div class="allocation-step"><button type="button" data-step="-1" aria-label="${titles[branch.id]} 배분 줄이기">−</button><output>0</output><button type="button" data-step="1" aria-label="${titles[branch.id]} 배분 늘리기">＋</button></div>`;
      this.q('.allocation-stats').append(row);
    }
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-close')) { this.close(); return; }
      if (this.busy) return;
      if (button.dataset.step) {
        const key = button.closest('[data-stat]').dataset.stat;
        this.draft[key] += Number(button.dataset.step);
        this.feedback('');
        this.update();
      } else if (button.hasAttribute('data-apply')) {
        void this.submit({type: 'ALLOCATE', expectedAttempt: this.mine.growth.attemptSeq, levels: {...this.draft}}, '능력치를 적용했습니다.');
      } else if (button.dataset.trait) {
        void this.submit({type: 'TRAIT', offerId: this.offer.id, traitId: button.dataset.trait}, '특성을 장착했습니다.');
      } else if (button.hasAttribute('data-ready')) {
        void this.submit({type: 'READY_WAVE', ready: this.mine.growth.readyWave !== this.state.wave}, '');
      }
    });
  }
  feedback(text) { this.q('.allocation-feedback').textContent = text; }
  receive(state, playerId) {
    const mine = state.players.find(player => player.id === playerId);
    this.state = state;
    this.mine = mine;
    if (!mine?.growth || state.phase !== 'PREP') { this.close(); return; }
    const key = state.id + '/' + state.wave;
    const newWave = this.waveKey !== key;
    if (newWave || this.revision !== mine.growth.attemptSeq) this.draft = freshDraft();
    this.revision = mine.growth.attemptSeq;
    this.waveKey = key;
    this.offer = mine.growth.offers.find(o => !o.selected && o.choices.length);
    if (newWave) {
      this.feedback('');
      if (state.wave > 0) this.open();
    }
    if (this.root.open) this.update();
  }
  open() {
    if (this.state?.phase !== 'PREP') return;
    if (!this.root.open) this.root.showModal();
    this.update();
  }
  close() { if (this.root.open) this.root.close(); }
  dispose() { this.close(); this.root.remove(); }
  async submit(command, message) {
    this.busy = true;
    this.update();
    const key = this.waveKey;
    try {
      if (await this.send({...command, wave: this.state.wave}) && key === this.waveKey && message) {
        if (this.root.open) this.feedback(message);
        else this.notify(message);
      }
    } finally {
      this.busy = false;
      if (this.root.open) this.update();
    }
  }
  update() {
    const {state, mine} = this, {levels} = mine.growth, policy = state.growthPolicy;
    const total = allocationCost(policy, levels, this.draft) || 0;
    const income = mine.growth.draws.find(d => d.wave === state.wave);
    this.q('[data-wave]').textContent = state.wave ? state.wave+' 웨이브 완료' : '첫 공세 준비';
    this.q('[data-wallet]').textContent = format(mine.credits)+' P';
    this.q('[data-income]').textContent = income ? '이번 공세 +'+format(income.amount)+' P' : '웨이브를 마치면 포인트를 받습니다.';
    this.q('[data-clock]').textContent = Math.max(0, Math.ceil((state.phaseUntil - state.time) / 1000))+'초';
    const brief = state.waveBrief;
    this.q('[data-forecast]').textContent = brief ? (brief.wave+' 웨이브 · '+brief.name+(brief.kind==='NORMAL'?'':' · '+String.fromCharCode(65 + brief.focus)+' 분대 주의')) : '';
    for (const branch of GROWTH_BRANCHES) {
      const id = branch.id, row = this.q('[data-stat="'+id+'"]'), level = levels[id], count = this.draft[id];
      const next = level + count;
      const effect = n => {
        const value = id === 'TACTIC' ? Math.min(40, n * policy.effects[branch.key] + (mine.growth.traits.includes('QUICK') ? 10 : 0)) : n * policy.effects[branch.key];
        return (value ? id === 'TACTIC' ? '−' : '+' : '') + value + '%';
      };
      const tier = growthTier(policy, next + 1);
      row.querySelector('[data-level]').textContent = 'Lv. '+level+' / 10';
      row.querySelector('output').textContent = count;
      row.querySelector('[data-effect]').textContent = count || tier ? effect(level)+' → '+effect(count ? next : level + 1) : effect(level);
      row.querySelector('[data-cost]').textContent = tier ? '한 단계 '+format(tier.cost)+' P' : '최대 단계';
      row.querySelector('[data-step="-1"]').disabled = this.busy || !count;
      row.querySelector('[data-step="1"]').disabled = this.busy || !tier || total + tier.cost > mine.credits;
      row.classList.toggle('is-drafted', count > 0);
    }
    const traits = this.q('[data-traits]'), choices = this.offer?.choices || [];
    this.q('.allocation-traits').hidden = !choices.length;
    const key = choices.join('/');
    if (traits.dataset.choices !== key) {
      traits.replaceChildren();
      for (const id of choices) {
        const trait = DEFENSE_TRAITS.find(item => item.id === id);
        const button = document.createElement('button'), name = document.createElement('b'), info = document.createElement('small');
        button.type = 'button'; button.dataset.trait = id;
        name.textContent = trait.name; info.textContent = trait.description;
        button.append(name, info); traits.append(button);
      }
      traits.dataset.choices = key;
    }
    traits.querySelectorAll('button').forEach(b => { b.disabled = this.busy; });
    const apply = this.q('[data-apply]'), ready = this.q('[data-ready]');
    apply.textContent = total ? '배분 적용 · '+format(total)+' P' : '배분 적용';
    apply.disabled = this.busy || !total;
    ready.textContent = mine.growth.readyWave === state.wave ? '준비 취소' : '정비 완료';
    ready.disabled = this.busy || total > 0;
  }
}
