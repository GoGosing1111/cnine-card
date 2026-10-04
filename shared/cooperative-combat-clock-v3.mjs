// Three squads share the field, not a single presentation queue. Gauge order,
// owner-linked mercenary credit, damage and healing are still server outcomes.
export function cooperativeCombatGroupMs(events,version=3){
 if(events.some(e=>e.type==='DEPLOY'))return version>=4?600:470;
 const actions=events.filter(e=>['TURN','ATTACK','COUNTER','SKILL','ULTIMATE','PVE_ULTIMATE','BOSS_ULTIMATE','ICON_SKILL'].includes(e.type)||e.type.startsWith('MERCENARY_'));
 // Recovery/shield/aura records accompany the action; they never reserve another
 // second of global time. Skills need a slot too (formerly zero milliseconds).
 // v4 keeps simultaneous actors but leaves a readable gap between new actions.
 // Existing rooms retain v3 timestamps when a mechanic rebuilds their timeline.
 return actions.length?(version>=4?340:190):0;
}
