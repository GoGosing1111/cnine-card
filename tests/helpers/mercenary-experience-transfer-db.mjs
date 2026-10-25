import {mercenaryFixture} from './mercenary-db.mjs';
import {ensureMercenaryLevelSchema,readMercenaryLevelState} from '../../functions/_mercenary_level_policy.js';
import {MERCENARY_LEVEL_KEY,mercenaryLevelDraft,mercenaryGrowthDraft} from '../../shared/mercenary-level-v1.mjs';
import {runPreparedMercenaryLevel,previewExperienceExtraction} from '../../functions/_mercenary_level.js';
import {readExperienceTransfer} from '../../functions/_mercenary_experience_transfer.js';
const codes=['V-049','V-055','V-001','V-996','V-999'];
export function transferFixturePolicy(){const p=mercenaryLevelDraft();p.mode='ON';p.revision=7;p.xpPerCard=Object.fromEntries(Object.keys(p.xpPerCard).map(r=>[r,100]));p.levels.forEach(r=>r.requiredXp=300);p.milestones.forEach(r=>r.successChancePpm=500000);p.growth=mercenaryGrowthDraft();Object.assign(p.growth.perLevel,{hpPercent:2,attackPercent:3,defensePercent:1,speedPercent:.25});p.growth.milestones.forEach(r=>Object.assign(r,{hpPercent:10,attackPercent:15,defensePercent:4,speedPercent:.5,skillPowerPercent:2.5,mitigationBypassPercent:5,actionCatchupPercent:2,actionCreditPercent:1}));return p;}
export async function transferFixture(t,postgres=false){
 const f=await mercenaryFixture(t,{postgres});await ensureMercenaryLevelSchema(f.env);const policy=transferFixturePolicy();await f.setting(MERCENARY_LEVEL_KEY,policy);
 for(const card of f.document.mercenaries)if(codes.includes(card.code))card.rank=card.code==='V-001'?'S':'SSS';
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
 for(const code of codes)await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,31,30,?,?)',code,'2026-10-25','2026-10-25').run();
 f.setState=(code,state)=>f.p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(7,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at',code,state.level===21?20:state.level,state.experience,state.breakthroughMask,state.revision,'2026-10-25').run();
 f.body=async(code,extra={})=>({requestId:crypto.randomUUID(),mercenaryCode:code,revision:(await readMercenaryLevelState(f.env,7,code)).revision,policyRevision:policy.revision,transferRevision:(await readExperienceTransfer(f.env,7)).state.revision,...extra});
 f.extract=async code=>{const b=await f.body(code),q=await previewExperienceExtraction(f.env,f.user,b);return runPreparedMercenaryLevel(f.env,f.user,{...b,expectedXp:q.xp,group:q.group},'EXTRACT');};
 return {...f,policy};
}
