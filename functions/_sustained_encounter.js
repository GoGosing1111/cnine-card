// Opt-in timed PVE reinforcements. At most 12 slots, 179 refills and one boss.
// The canonical simulator continues to own all damage, HP and skill budgets.
export function sustainedEncounterPlan(config, initial, capacity) {
  if (!config) return null;
  const {durationMs, templates, finalBoss} = config;
  const finalAdds=config.regionId?(config.finalAdds||[]):[];
  if(finalAdds.length>2||finalAdds.some(c=>!c.isMonster||c.isBoss||c.side!=='B'||c.hp<=0))throw Error('INVALID_SUSTAINED_ADDS');
  if (![750000,765000,780000,900000].includes(durationMs) || capacity !== 12 || initial.length !== capacity ||
      !Array.isArray(templates) || templates.length < 1 || templates.length > 12 || !finalBoss) {
    throw Error('INVALID_SUSTAINED_ENCOUNTER');
  }
  for (const card of [...templates, finalBoss]) {
    if (!card.isMonster || card.side !== 'B' || !card.id || !Number.isFinite(card.hp) || card.hp <= 0 ||
        !Number.isFinite(card.speed) || card.speed <= 0) throw Error('INVALID_SUSTAINED_MONSTER');
  }
  const intervalMs = 5000, instances = initial.map(card => ({...card}));
  let nextAt = intervalMs, bossSpawned = false, defeated = 0, wave = 0;
  return {
    instances,
    get nextAt() { return nextAt; },
    get bossSpawned() { return bossSpawned; },
    get defeated() { return defeated; },
    advance(at, enemies, emit) {
      if (at !== nextAt || bossSpawned) throw Error('INVALID_SUSTAINED_STEP');
      // Retire dead generations so targeting/AI never scans a growing history.
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (!enemies[i].alive || enemies[i].hp <= 0) { enemies.splice(i, 1); defeated++; }
      }
      const spawn = card => {
        instances.push({...card}); enemies.push(card);
        emit('ENEMY_SPAWN', {targetId:card.id,slot:card.slot,boss:!!card.isBoss,
          targetHpAfter:card.hp,targetMaxHp:card.maxHp,targetShieldAfter:card.shield,name:card.title||card.name});
      };
      if (at === durationMs) {
        // Surviving minions retreat; this is not a kill and cannot roll loot.
        for (const card of enemies) {
          card.alive = false; card.hp = 0;
          emit('ENEMY_DESPAWN', {targetId:card.id,slot:card.slot,label:'군단 후퇴'});
        }
        enemies.length = 0;
        for(const [index,add] of finalAdds.entries())spawn({...add,slot:index});
        spawn({...finalBoss,slot:4}); bossSpawned = true; nextAt = Infinity;
      } else {
        const occupied = new Set(enemies.map(card => card.slot));
        let eliteDue=Boolean(config.regionId&&wave>0&&wave%12===0);
        for (let slot = 0; slot < capacity; slot++) if (!occupied.has(slot)) {
          const template = templates[(wave + slot) % templates.length];
          const elite=eliteDue;eliteDue=false;
          spawn({...template,id:initial[slot].id+':R'+(wave+1),slot,...(elite?{huntElite:true,title:'정예 '+template.title,maxHp:Math.round(template.maxHp*2),hp:Math.round(template.maxHp*2),attack:Math.round(template.attack*1.25)}:{})});
        }
        wave++; nextAt = Math.min(durationMs, at + intervalMs);
      }
    }
  };
}
