import {writeFile} from 'node:fs/promises';
import {sample, vehicles} from './battle-samples.mjs';

const save = (file, data) => writeFile(new URL(file,import.meta.url),JSON.stringify(data)+'\n');
for (const mode of ['tower','pve','hunt','pvp','duo']) {
  let scene;
  const variants={};
  for (const code of vehicles) {
    const others = mode==='duo'?['BMW_M9','AETHER_ZERO','HELIOS_R']:mode==='pvp'?['ROLLS_ROYCE_HYPERCAR']:[];
    const p=sample(mode,[code,...others]), b=p.battleV2;
    if (!scene) {
      const {battleV2,characterBonus,mercenaries,huntPlayback,huntPolicy, ...presentation}=p;
      scene={...presentation,battleV2:{schemaVersion:b.schemaVersion,mode:b.mode,engine:b.engine,seed:b.seed,rules:b.rules,playbackSpeed:b.playbackSpeed,encounter:b.encounter}};
    }
    const initial=new Set(Object.values(b.teams).flatMap(team=>[...team.cards,...(team.mercenaries||[])].map(c=>c.id)));
    const events=b.result.timeline.filter(e=>e.type==='TURN' && initial.has(e.actorId) && initial.has(e.targetId) && !e.dodge);
    const own=b.teams.A.mercenaries.filter(m=>m.vehicleSupport?.ownerId===1);
    const first=new Set(own.flatMap(row=>[events.find(e=>e.actorId===row.id && e.vehicleSupportHit===code),
      events.find(e=>e.targetId===row.id && e.vehicleSupportGuard===code)]).filter(Boolean));
    variants[code]={teams:b.teams,result:{winner:b.result.winner,reason:b.result.reason,timeline:events.filter(e=>first.has(e))}};
    if (['pve','pvp'].includes(mode) && ['AETHER_ZERO','ASTRA_VOLT'].includes(code)) await save((code==='ASTRA_VOLT'?'astra-':'')+mode+'.json',p);
  }
  await save(mode+'-review.json',{scene,variants});
}
