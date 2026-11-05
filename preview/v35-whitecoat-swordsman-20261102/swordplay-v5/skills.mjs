export const techniques = {
  skill_flash:  {name: '절광발도', motion: 'skill_iai',    area: false},
  skill_thrust: {name: '삼첩관통', motion: 'skill_rift',   area: false},
  skill_wheel:  {name: '회천검압', motion: 'skill_tempest', area: true},
  skill_rain:   {name: '만검낙성', motion: 'skill_verdict', area: true}
};

// The action clock owns both native pose time and all layers of a cut.
export const whitecoatMotionRate = 2;

export function prepareStrike(engine, attacker, options) {
  const technique = techniques[options.action];
  const rows = new Map();
  const allowed = target => engine.isAlive(target) && !target.root?.destroyed &&
    target.team !== attacker.team && !target.untargetable;

  if (technique && Array.isArray(options.hits)) {
    for (const hit of options.hits) {
      const target = engine.combatantById(hit?.targetId);
      if (!allowed(target) || rows.has(target)) continue;
      if (!technique.area && options.target && options.target !== target) continue;
      rows.set(target, hit);
      if (!technique.area) break;
    }
  } else if (!technique?.area && allowed(options.target)) {
    rows.set(options.target, null);
  }
  const targets = [...rows.keys()];
  const primary = rows.has(options.target) ? options.target : targets[0];
  const applied = new Set();
  return {
    technique: technique ? options.action : null,
    primary, targets, owners: [attacker, ...targets],
    apply() {
      for (const [target, hit] of rows) {
        if (applied.has(target) || !allowed(target)) continue;
        applied.add(target);
        const hp = hit
          ? engine.eventHpPercent(target, hit.targetHpAfter, hit.targetMaxHp ?? hit.maxHp)
          : options.targetHp;
        const shield = hit ? hit.targetShieldAfter : options.targetShield;
        if (shield != null) engine.syncTargetShield(target, Number(shield), hit?.targetMaxShieldAfter ?? hit?.targetMaxShield);
        if (hp != null) engine.syncTargetHp(target, Number(hp));
        options.onImpact?.(target);
        engine.showAccountBattleUnitDamage(target, {damage: Number((hit ? hit.damage : options.damage) ?? 0)});
      }
    },
    get count() { return applied.size; }
  };
}
