// Three squads share the field, not a single presentation queue. Gauge order,
// owner-linked mercenary credit, damage and healing are still server outcomes.
export function cooperativeCombatGroupMs(events){
 if(events.some(e=>e.type==='DEPLOY'))return 470;
 const actions=events.filter(e=>['TURN','ATTACK','COUNTER','SKILL','ULTIMATE','PVE_ULTIMATE','BOSS_ULTIMATE','ICON_SKILL'].includes(e.type)||e.type.startsWith('MERCENARY_'));
 // Recovery/shield/aura records accompany the action; they never reserve another
 // second of global time. Skills need a slot too (formerly zero milliseconds).
 return actions.length?190:0;
}
