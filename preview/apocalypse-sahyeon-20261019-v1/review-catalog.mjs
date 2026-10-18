// Build-time substitution ONLY for this isolated preview. Production keeps its own catalog.
import * as live from '../../shared/apocalypse-legion-v1.mjs';
import {SAHYEON} from './boss.mjs';
export * from '../../shared/apocalypse-legion-v1.mjs';
export const APOCALYPSE_LEGION_BOSSES=Object.freeze([...live.APOCALYPSE_LEGION_BOSSES.filter(b=>b.monsterId!==SAHYEON.monsterId),SAHYEON]);
const isDraft=monster=>[monster?.monsterId,monster?.id,monster?.cardId,monster].some(v=>/(?:^|:)80$/.test(String(v??'')));
export const apocalypseLegionBoss=monster=>isDraft(monster)?SAHYEON:live.apocalypseLegionBoss(monster);
export const apocalypseLegionSkill=code=>SAHYEON.skills.find(s=>s.code===code)||live.apocalypseLegionSkill(code);
export const apocalypseLegionSuitDefense=(monster,raw)=>isDraft(monster)?Math.max(0,Math.min(100,raw==null||raw===''?50:Number(raw)||0)):live.apocalypseLegionSuitDefense(monster,raw);
export function apocalypseLegionUltimate(monster,raw={}){
 if(!isDraft(monster))return live.apocalypseLegionUltimate(monster,raw);
 const percent=(v,max,fallback)=>v==null||v===''||!Number.isFinite(Number(v))?fallback:Math.max(0,Math.min(max,Number(v)));
 return {enabled:raw?.enabled!==false,attackPercent:percent(raw?.attackPercent,1000,30),shieldPiercePercent:percent(raw?.shieldPiercePercent,100,65)};
}
export const configuredApocalypseLegionSkills=(monster,raw)=>isDraft(monster)?SAHYEON.skills.map(s=>s.kind==='ultimate'?{...s,...apocalypseLegionUltimate(monster,raw)}:{...s}):live.configuredApocalypseLegionSkills(monster,raw);
