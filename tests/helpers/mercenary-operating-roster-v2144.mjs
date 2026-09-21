import fixture from '../fixtures/mercenary-operating-roster-20260922.json' with {type:'json'};
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
export {fixture};
export const operatingMercenaries=fixture.roster.map(row=>({
 ...seed.catalog.cards.find(c=>c.code===row.code),...row,level:1,statMode:'RANK_FIXED',combat:fixture.combat,
 skills:row.skills.map(s=>({...seed.document.skills.find(item=>item.id===s.id),...s,review:'REVIEWED'})),
}));
export const tierDecks={balanced:['ATTACK','DEFENSE','SPEED','HP','ATTACK'],attack:['ATTACK','ATTACK','ATTACK','ATTACK','HP'],defense:['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],speed:['SPEED','SPEED','SPEED','HP','ATTACK']};
export const tierCards=(power,types=tierDecks.balanced)=>types.map((power_type,i)=>({id:'QA-'+i,power,power_type}));
