// Input: metadata-only snapshot obtained with BEGIN READ ONLY. No player records.
// Runs the same power, high-enhancement and unique-effect helpers as production.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {readMercenaryDocument,readMercenaryRuntime,battleConfig} from '../functions/_mercenary_account.js';
import {FUR_MAX_ENHANCEMENT,extendFurHighBreakthrough} from '../functions/_fur_enhancement_v2114.js';
const snapshot=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
if(snapshot.readOnly!==true)throw Error('A read-only metadata snapshot is required');
const settings=new Map(snapshot.settings.map(r=>[r.key,r.value]));
// The in-memory fixture has no progression records and needs no schema writes.
settings.set('safe_runtime_upgrade_v1937_card_unique_advancement_tx_guard','1');
const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){
 if(sql.includes('mercenary_cms_documents'))return snapshot.cms;
 if(sql.includes('app_meta'))return settings.has(args[0]||sql.match(/key='([^']+)'/)?.[1])?{value:settings.get(args[0]||sql.match(/key='([^']+)'/)?.[1])}:null;
 throw Error('Unexpected fixture read: '+sql);
},async all(){
 if(sql.includes('app_meta'))return {results:snapshot.settings};
 if(sql.includes('card_unique_effects'))return {results:snapshot.cards.filter(c=>args.includes(c.id)&&c.unique_effect?.is_active&&c.unique_effect?.scope_pve).map(c=>c.unique_effect)};
 if(sql.includes('card_unique_advancements'))return {results:[]};
 throw Error('Unexpected fixture read: '+sql);
}};}}};
const source=await fs.readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const fn=name=>{const at=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(source)?.index;if(at===undefined)throw Error(name);return source.slice(at).split(/\r?\n(?=(?:async )?function |const |let )/)[0];};
const constant=name=>source.match(new RegExp(`^const ${name}\\s*=.*;$`,'m'))?.[0]||(()=>{throw Error(name)})();
const context=vm.createContext({FUR_MAX_ENHANCEMENT,extendFurHighBreakthrough,normalizeNightmareSettings:()=>({}),normalizeApocalypseSettings:()=>({}),normalizeUltimateRequiredGrade:x=>x});
vm.runInContext([
 ...['BATTLE_POWER_DEFAULT','BATTLE_BREAKTHROUGH_DEFAULT','HIGH_BREAKTHROUGH_BONUS_DEFAULT','FUR_MASTER_STAR_BREAKTHROUGH_DEFAULT','FAKER_CHAMPIONSHIP_CARD_ID','FAKER_FLAT_POWER_BONUS'].map(constant),
 ...['normalizeBattleEngineSettings','defaultBattleSettings','cleanBattleSettingsPayload','cleanHighBreakthroughSteps','cleanFurMasterStarBreakthrough','readBattleSettings','cardPowerBase','breakthroughBonusPercent','cardBattlePower'].map(fn)
].join('\n'),context);
const battle=await context.readBattleSettings(env),cms=await readMercenaryDocument(env),runtime=await readMercenaryRuntime(env);
const mercenaries=cms.document.mercenaries.filter(m=>['SS','SSS'].includes(m.rank)).map(m=>({...battleConfig(cms.document,m.code,1),combat:runtime.combat}));
const levels=[0,10,13],cardsByLevel={};
for(const level of levels){
 const cards=snapshot.cards.map(({unique_effect,updated_at,is_active,...c})=>({...c,grade:c.rarity,breakthroughLevel:level,power:context.cardBattlePower(c,level,battle)}));
 const effects=new Map((await cardUniqueDeckStates(env,[{user:{id:1,role:'USER'},cards}],'PVE',{fresh:true}))[0].cards.map(c=>[c.id,c]));
 cardsByLevel[level]=cards.map(c=>({...c,uniqueAbility:effects.get(c.id)?.uniqueAbility||null,uniqueAdvancement:null}));
}
const fixture={checkedAt:snapshot.checkedAt,source:'Production metadata / read-only / no account data',cmsRevision:cms.revision,assumptions:{enhancementLevels:levels,uniqueAdvancement:'NONE',equipmentBonus:'scenario input',mercenaryLevel:1},singleHealerBonus:battle.engine.singleHealerBonus,mercenaries,cardsByLevel};
await fs.writeFile(new URL('../tests/fixtures/cooperative-balance-20261001.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify({cards:snapshot.cards.length,mercenaries:mercenaries.length,cmsRevision:cms.revision,levels}));
