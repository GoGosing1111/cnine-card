// Adjacent bullets against one instance can share a visual receipt. Preserve
// the last impact time/HP and every point of server damage; never cross a card
// action, skill, KO, spawn or target boundary. Cosmetic sustained fire stays on.
export function compactHuntTimeline(events) {
  const rows=[];
  const bullet=e=>e?.type==='TURN'&&e.actorKind==='BATTLE_SUIT'&&!e.dodge;
  let firstAt=0;
  for(const source of events){
    const last=rows.at(-1);
    if(bullet(source)&&bullet(last)&&source.actorId===last.actorId&&source.targetId===last.targetId&&source.combatAtMs-firstAt<=100){
      const damage=(last.damage||0)+(source.damage||0),absorbed=(last.absorbed||0)+(source.absorbed||0),shotCount=(last.shotCount||1)+1,critical=last.critical||source.critical;
      Object.assign(last,source,{damage,absorbed,shotCount,critical});
    }else{rows.push({...source});firstAt=source.combatAtMs;}
  }
  return rows.map((event,i)=>({...event,seq:i+1}));
}
