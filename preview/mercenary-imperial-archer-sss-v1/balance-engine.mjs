import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';

// Offline preparation adapter, following the existing Cryvern candidate flow.
// Only this explicitly imported Node module installs the policy. Production
// sources, browser renderer, roster and database remain untouched. Each exact
// insertion fails closed if the canonical engine changes; no stale engine copy.
const policyUrl=new URL('./balance.mjs',import.meta.url).href;
function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('ARCHER_CANDIDATE_ENGINE_ANCHOR_CHANGED: '+from.slice(0,100));
 return source.replace(from,to);
}
registerHooks({load(url,context,next){
 if(!url.endsWith('/functions/_mercenary_combat.js')&&!url.endsWith('/shared/mercenary-combat-link-v2103.mjs'))return next(url,context);
 let source=readFileSync(new URL(url),'utf8');
 const add=(from,to)=>{source=replaceOnce(source,from,to);};
 if(url.endsWith('/functions/_mercenary_combat.js')){
  source=`import {IMPERIAL_ARCHER_COMBAT,isImperialArcher,imperialArcherCredit,imperialArcherBasicScale,imperialArcherCap,imperialArcherTargets,resolveImperialArcherCast,ARCHER_VOLLEY,ARCHER_RAIN} from '${policyUrl}';\n`+source;
  for(const actors of ['actors','teams[side]||[]','g.actors'])add(`Math.max(azantActionCredit(${actors})`,`Math.max(imperialArcherCredit(${actors}),azantActionCredit(${actors})`);
  add("const rankPower=supreme?supreme.basePower:","const rankPower=isImperialArcher(snapshot)?IMPERIAL_ARCHER_COMBAT.basePower:supreme?supreme.basePower:");
  add('supreme?supreme.speedScale:snapshot.code===AZANT_CODE','isImperialArcher(snapshot)?IMPERIAL_ARCHER_COMBAT.speedScale:supreme?supreme.speedScale:snapshot.code===AZANT_CODE');
  add('const scale=skill?.id===AZANT_VOLLEY_SKILL?','const scale=isImperialArcher(actor)&&[ARCHER_VOLLEY,ARCHER_RAIN].includes(skill?.mechanic)?imperialArcherCap(actor,skill):skill?.id===AZANT_VOLLEY_SKILL?');
  add('const basicScale=azantPvpBasicDamageScale(a)','const basicScale=imperialArcherBasicScale(a)*azantPvpBasicDamageScale(a)');
  add('if(s.mechanic===VALTER_AREA_MECHANIC)return',
   'if([ARCHER_VOLLEY,ARCHER_RAIN].includes(s.mechanic))return imperialArcherTargets(a,s,en);\n  if(s.mechanic===VALTER_AREA_MECHANIC)return');
  add('case VALTER_AREA_MECHANIC:{',`case ARCHER_VOLLEY:case ARCHER_RAIN:{
    const damageScale=offensiveSkillScale(a,s);
    resolveImperialArcherCast({actor:a,skill:s,targets:ts,hit,
     damage:(t,n)=>damage(t,s.mechanic===ARCHER_VOLLEY?interceptDamage(a,t,n):n,{actor:a,direct:true}),knockout,emit,damageScale,
     capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case VALTER_AREA_MECHANIC:{`);
  add('AZANT_AREA_MECHANIC,AZANT_VOLLEY_MECHANIC,BERKAN_MECHANIC]',
   'AZANT_AREA_MECHANIC,AZANT_VOLLEY_MECHANIC,BERKAN_MECHANIC,ARCHER_RAIN]');
 }else{
  source=`import {IMPERIAL_ARCHER_COMBAT,isImperialArcher} from '${policyUrl}';\n`+source;
  add('const rule=isJokro(m)?','const rule=isImperialArcher(m)?IMPERIAL_ARCHER_COMBAT.link:isJokro(m)?');
 }
 return {format:'module',shortCircuit:true,source};
}});
export const {buildFighter,createPvpBattleV2,createPveBattleV2,createDuoBattleV2}=await import('../../functions/_battle_v2_preview.js');
export const {buildMercenaryFighter,mercenaryCombat,mercenaryTurnCadence,mercenaryBaseActionCredit}=await import('../../functions/_mercenary_combat.js');
