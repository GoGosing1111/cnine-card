import {loadCoopOwnedCards} from './_cooperative_live.js';
import {mercenaryAccountState,readMercenaryDocument,battleConfig} from './_mercenary_account.js';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {DEFENSE_PROFILES,DEFENSE_ROLE_NAMES,defenseSelection} from '../shared/monster-defense-loadout-v1.mjs';
import zenith from '../assets/ui/project-v/characters/zenith/manifest-v1.json' with {type:'json'};
import fur from '../assets/ui/project-v/characters/fur/manifest-v2.json' with {type:'json'};
import prestige from '../assets/ui/project-v/characters/prestige/manifest-v1.json' with {type:'json'};
import superstar from '../assets/ui/project-v/characters/superstar/manifest-v1.json' with {type:'json'};
import icon from '../assets/ui/project-v/characters/icon/manifest-v1.json' with {type:'json'};
import fallback from '../assets/ui/project-v/fallback/manifest-v1.json' with {type:'json'};
const artByCard=new Map([zenith,fur,prestige,superstar,icon].flatMap(m=>m.characters.map(c=>[c.cardId,c])));
const url=value=>typeof value==='string'&&value?(/^(https?:)?\/\//.test(value)?value:'/'+value.replace(/^\/+/,'')):'';
function anchor(art){const p=art.footAnchor||art.placement?.footAnchor;return Array.isArray(p)?{x:p[0],y:p[1]}:p||{x:.5,y:.98};}
function mercenaryRole(merc){
 if(merc.role==='SUPPORT'||merc.skills?.some(s=>/HEAL|NURSE/.test(s.mechanic||'')))return 'HEALER';
 if(merc.role==='GUARDIAN')return 'GUARD';
 return ['RANGED','CAST'].includes(mercenaryAttackStyle(merc))?'RANGED':'STRIKER';
}
const profile=(entry,role)=>({...entry,role,roleName:DEFENSE_ROLE_NAMES[role],defense:{...DEFENSE_PROFILES[role]}});
export async function readDefenseRoster(env,user,deps,{cardIds=null}={}){
 const [cards,owned,config]=await Promise.all([loadCoopOwnedCards(env,user,deps,cardIds),mercenaryAccountState(env,user),readMercenaryDocument(env)]);
 const mercenaries=owned.cards.filter(c=>c.canDeploy&&owned.available).map(c=>{
  const battle=battleConfig(config.document,c.code,c.level);
  return profile({code:c.code,name:c.name,kind:'MERCENARY',rank:c.rank,edition:c.edition||null,level:c.level||1,sourceArt:url(c.sourceArt),battleSprite:url(c.battleSprite),footAnchor:anchor(c),
   mercenary:{code:c.code,role:battle.role,position:battle.position,attackStyle:mercenaryAttackStyle(battle),skills:structuredClone(battle.skills||[]),combat:structuredClone(owned.policy.combat)}},mercenaryRole(battle));
 });
 return {mercenaries,cards:cards.map(c=>{
  const art=artByCard.get(c.id)||fallback.fallbacks.CARD;
  return profile({code:'CARD:'+c.id,cardId:c.id,name:c.title,kind:'CARD',rank:c.grade,level:c.breakthroughLevel||0,sourceArt:url(c.image||art.sourceArt||art.battleSprite),battleSprite:url(art.battleSprite),footAnchor:anchor(art),fullBodyHeight:260*Math.min(2,Math.max(.5,Number(art.scaleMultiplier)||1)),fallbackSprite:!artByCard.has(c.id)},'CAPTAIN');
 }),statMode:'DEFENSE_ROLE',rules:{mercenaries:2,cards:1}};
}
export async function loadDefenseSelection(env,user,value,deps){
 const loadout=defenseSelection(value);
 if(!loadout.card.startsWith('CARD:')||!loadout.card.slice(5))throw Object.assign(Error('보유 카드 목록에서 출전할 카드를 선택하세요.'),{code:'DEFENSE_OWNERSHIP',status:403});
 const options=await readDefenseRoster(env,user,deps,{cardIds:[loadout.card.slice(5)]});
 const roster=[...loadout.mercenaries.map(code=>options.mercenaries.find(c=>c.code===code)),options.cards.find(c=>c.code===loadout.card)];
 if(roster.some(c=>!c))throw Object.assign(Error('현재 보유하고 출전 가능한 용병 2명과 카드 1장만 선택할 수 있습니다. 목록을 새로 불러와 주세요.'),{code:'DEFENSE_OWNERSHIP',status:403});
 return {loadout,roster};
}
