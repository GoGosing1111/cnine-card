import { ROLE_BY_ID } from '../shared/mercenary-advancement-v1.mjs';

const alive = actor => actor && actor.alive !== false && actor.hp > 0 && !actor.untargetable;
const combatant = actor => alive(actor) && !actor.isBattleSuit && !actor.isIconSummon;
const ratio = actor => actor.hp / Math.max(1, actor.maxHp);
const healthOrder = (a, b) => ratio(a) - ratio(b) || a.slot - b.slot || String(a.id).localeCompare(String(b.id));

// One instance belongs to one simulation. Action counters are independent of target count,
// projectile count, rendered frames, and the order in which teammates take their turns.
export function mercenaryAdvancementCombat({ teams, emit, heal, cleanseOne, extraHit, knockout }) {
  const members = [...teams.A, ...teams.B];
  const states = new Map(members.filter(a => a.isMercenary && ROLE_BY_ID.has(a.advancementId)).map(a => [a, {
    role: a.advancementId, attacks: 0, actions: 0, lastTarget: null, charged: false, wards: 3, survived: false
  }]));
  if (!states.size) return null;
  const commanders = [...states.keys()].filter(a => states.get(a).role === 'commander');
  const auraOwners = new Set(), auraTargets = new Map(), boosted = new Map();
  const teamAttacker = a => a?.alive !== false && a?.hp > 0 && Number.isFinite(a.attack);
  let turn = null, sequence = 0;
  function publish(actor, target, details = {}) {
    const role = states.get(actor).role;
    emit('MERCENARY_ADVANCEMENT', { roleId: role, actorId: actor.id, targetId: target.id,
      revision: ++sequence, label: ROLE_BY_ID.get(role).name, ...details });
  }
  function updateCommand() {
    if (!commanders.length) return;
    for (const source of commanders) {
      const active = teamAttacker(source);
      const allyIds = active ? teams[source.side].filter(teamAttacker).map(a => a.id) : [];
      const same = active === auraOwners.has(source), previous = auraTargets.get(source) || [];
      if (same && allyIds.length === previous.length && allyIds.every((id,i) => previous[i] === id)) continue;
      if (active) auraOwners.add(source); else auraOwners.delete(source);
      auraTargets.set(source, allyIds);
      publish(source, source, { active, allyIds, burst: active && !same });
    }
    for (const actor of [...teams.A, ...teams.B]) {
      const on = teamAttacker(actor) && commanders.some(c => c.side === actor.side && auraOwners.has(c));
      const saved = boosted.get(actor);
      if (on && !saved) {
        const base = actor.attack, floor = actor.mercenaryLink?.attackFloor;
        actor.attack = Math.round(base * 1.08);
        if (floor) actor.mercenaryLink = { ...actor.mercenaryLink, attackFloor: Math.round(floor * 1.08) };
        boosted.set(actor, { base, applied: actor.attack, floor });
      } else if (!on && saved) {
        actor.attack = actor.attack === saved.applied ? saved.base : Math.round(actor.attack / 1.08);
        if (saved.floor) actor.mercenaryLink = { ...actor.mercenaryLink, attackFloor: saved.floor };
        boosted.delete(actor);
      }
    }
  }
  function grantShield(actor, target, fraction) {
    const amount = Math.max(1, Math.round(target.maxHp * fraction));
    target.shield += amount;
    target.maxShield = Math.max(target.maxShield || 0, target.shield);
    publish(actor, target, { amount, targetShieldAfter: target.shield, targetMaxShield: target.maxShield });
  }
  function grantHeal(actor, target, fraction, effectTarget = target) {
    if (!turn?.healingAllowed || !combatant(target) || target.hp >= target.maxHp) return;
    const amount = heal(target, Math.max(1, Math.round(target.maxHp * fraction)));
    if (amount <= 0) return;
    actor.healingDone = (actor.healingDone || 0) + amount;
    publish(actor, target, { healing: amount, targetHpAfter: target.hp, targetMaxHp: target.maxHp, effectTargetId: effectTarget.id });
  }
  function begin(actor, healingAllowed) {
    updateCommand();
    turn = { actor, primary: null, raw: 0, dealt: false, primaryHit: false, focus: false, empowered: false,
      wards: new Set(), marked: new Set(), healingAllowed };
    const state = states.get(actor);
    if (!state || !combatant(actor)) return;
    state.actions++;
    if (state.role === 'cleanser') {
      for (const target of teams[actor.side].filter(combatant).sort(healthOrder)) {
        const removed = cleanseOne(target);
        if (removed) { publish(actor, target, { removed }); break; }
      }
    }
  }
  function attempt(actor, target) {
    const s = states.get(actor);
    if (!s || turn?.actor !== actor || turn.primary || !combatant(target) || actor.side === target.side) return;
    turn.primary = target;
    s.attacks++;
    turn.focus = s.lastTarget === target;
    s.lastTarget = target;
    if (s.role === 'avenger' && s.charged) {
      s.charged = false; turn.empowered = true;
      publish(actor, actor, { charged: false, burst: false });
    }
  }
  function once(actor, target) {
    if (!turn.marked.has(actor)) { turn.marked.add(actor); publish(actor, target); }
  }
  function beforeDamage(actor, target, amount, options) {
    const direct = options.advancementDirect ?? options.direct;
    if (!actor || !direct || amount <= 0 || actor.side === target.side || options.advancementFollowup) return amount;
    const s = states.get(actor), defender = states.get(target);
    if (turn?.actor === actor && s) {
      attempt(actor, target);
      if (turn.primary === target) turn.raw += amount;
      let scale = 1;
      if (s.role === 'vanguard' && s.attacks === 1) scale = 1.40;
      if (s.role === 'duelist' && turn.focus && target === turn.primary) scale = 1.15;
      if (s.role === 'executioner' && ratio(target) <= .30) scale = 1.25;
      if (s.role === 'berserker' && ratio(actor) <= .50) scale = 1.20;
      if (s.role === 'avenger' && turn.empowered) scale = 1.20;
      if (scale !== 1) { amount = Math.round(amount * scale); once(actor, target); }
    }
    if (defender?.role === 'shield-knight' && turn && (defender.wards > 0 || turn.wards.has(target))) {
      if (!turn.wards.has(target)) {
        defender.wards--; turn.wards.add(target);
        publish(target, target, { remaining: defender.wards, burst: true });
      }
      amount = Math.round(amount * .70);
    }
    return amount;
  }
  function afterDamage(actor, target, result, options) {
    const state = states.get(target);
    if (state?.role === 'undying' && result.hpBefore > 0 && target.hp <= 0 && !state.survived) {
      state.survived = true;
      target.hp = Math.max(1, Math.round(target.maxHp * .10));
      result.hpAfter = target.hp; result.hpDamage = Math.max(0, result.hpBefore - target.hp);
      publish(target, target, { targetHpAfter: target.hp, targetMaxHp: target.maxHp, survived: true });
    }
    if (!actor || !(options.advancementDirect ?? options.direct) || actor.side === target.side || result.hpDamage + result.absorbed <= 0) return;
    if (!options.advancementFollowup && turn?.actor === actor) {
      turn.dealt = true;
      if (turn.primary === target) turn.primaryHit = true;
      if (result.advancementShieldDamage > 0) once(actor, target);
    }
    if (state?.role === 'avenger' && !state.charged && alive(target)) {
      state.charged = true;
      publish(target, target, { charged: true, burst: false });
    }
  }
  function end(actor) {
    const s = states.get(actor);
    if (turn?.actor === actor && s && combatant(actor)) {
      if (s.role === 'combo' && turn.primaryHit && s.attacks % 3 === 0 && combatant(turn.primary)) {
        const target = turn.primary;
        const hit = extraHit(actor, target, Math.max(1, Math.round(turn.raw * .30)));
        actor.damageDealt += hit.hpDamage + hit.absorbed;
        publish(actor, target, { damage: hit.hpDamage, absorbed: hit.absorbed, targetHpAfter: target.hp,
          targetMaxHp: target.maxHp, targetShieldAfter: target.shield });
        knockout(target);
      }
      if (s.role === 'vampire' && turn.dealt) grantHeal(actor, actor, .05, turn.primary || actor);
      if (s.role === 'regenerator') grantHeal(actor, actor, .04);
      if (s.role === 'healer') grantHeal(actor, teams[actor.side].filter(combatant).sort(healthOrder)[0], .03);
      if (s.role === 'guardian' && s.actions % 3 === 0) {
        const ally = teams[actor.side].filter(a => a !== actor && combatant(a)).sort(healthOrder)[0];
        if (ally) grantShield(actor, ally, .12);
      }
    }
    turn = null;
    updateCommand();
  }
  return {
    open() {
      for (const [actor, s] of states) if (combatant(actor)) {
        if (s.role === 'barrier') grantShield(actor, actor, .20);
        if (s.role === 'shield-knight') publish(actor, actor, { remaining: 3, burst: false });
      }
      updateCommand();
    },
    begin, attempt, beforeDamage, afterDamage, end, updateCommand
  };
}
