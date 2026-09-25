import {strongestDuoCards,validateDuoDeck,duoError,DUO_LIMITS} from '../shared/ranked-duo-v1.mjs';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';
import {FORGE_RUNTIME_RELEASE_ENABLED} from '../shared/equipment-forge-release-v1.mjs';
import {readMercenaryDocument,readMercenaryRuntime,battleConfig,mercenarySnapshotPower} from './_mercenary_account.js';
import {buildFighter,distributeEquipment} from './_battle_v2_preview.js';
import {buildMercenaryFighter,MERCENARY_SKILL_CAP_SCALE} from './_mercenary_combat.js';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {jointHash} from './_joint_transactions.js';
import {readDuoEquipment} from './_ranked_duo_equipment.js';

const parsed=(text,fallback=[])=>{try{return JSON.parse(text);}catch{return fallback;}};
const marks=ids=>ids.map(()=>'?').join(',');
const numeric=id=>Number(id);
export async function duoVersions(env,ids){
 return (await env.DB.prepare(`SELECT a.user_id,a.source_version,v.revision AS policy_revision,u.nickname,u.role,u.status,u.banned_until,p.source_version AS cached_version,p.policy_revision AS cached_policy,p.config_hash,p.payload_json,p.expires_at FROM ranked_duo_accounts_v1 a JOIN users u ON u.id=a.user_id CROSS JOIN ranked_duo_policy_version_v1 v LEFT JOIN ranked_duo_profiles_v1 p ON p.user_id=a.user_id WHERE v.id=1 AND a.user_id IN (${marks(ids)})`).bind(...ids).all()).results;
}
export function duoMercenaryRating(snapshot,cards,equipment,weight=1){
 const m=buildMercenaryFighter(snapshot,'A','PVP',buildFighter);if(!m)return 0;
 const baseHp=m.maxHp,baseAttack=m.attack;
 const fighters=distributeEquipment(cards,equipment).map((c,i)=>buildFighter(c,i,'A',null,'PVP'));
 applyMercenaryCombatLink([[...fighters,m]]);
 const ratio=(mercenaryEffectiveAttack(m)/Math.max(1,baseAttack)+(m.maxHp+m.shield)/Math.max(1,baseHp))/2;
 const skillBudget=(snapshot.skills||[]).reduce((sum,s)=>sum+Math.min(10,Math.max(0,Number(s.balance?.damageRatio)||0))*(MERCENARY_SKILL_CAP_SCALE[s.id]??1)/Math.max(2,Number(s.balance?.cooldownTurns||0)+1),0);
 return Math.round(mercenarySnapshotPower(snapshot)*Math.max(1,ratio)*(1+Math.min(2,skillBudget)*.1)*weight);
}

async function rebuild(env,versions,config,deps,hash,now){
 const ids=versions.map(v=>Number(v.user_id)),m=marks(ids),p=(sql)=>env.DB.prepare(sql).bind(...ids).all();
 // Rebuild only changed accounts. All row reads use user-leading indexes;
 // the limit is a hard input budget, never silently truncated into a rating.
 const [owned,decks,gear,vehicles,titles,mercRows,battle,mercDocument,mercRuntime]=await Promise.all([
  p(`SELECT uc.user_id,c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.focus_x,c.focus_y,mb.name,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id LEFT JOIN members mb ON mb.id=c.member_id WHERE uc.user_id IN (${m}) AND uc.quantity>0 LIMIT 65537`),
  p(`SELECT d.user_id,d.card_ids AS defense_ids,CASE WHEN COALESCE(a.preset_no,1)=1 THEN COALESCE(pr.card_ids,d.card_ids) ELSE pr.card_ids END AS attack_ids,COALESCE(a.preset_no,1) AS preset_no FROM pvp_decks d LEFT JOIN pvp_active_presets a ON a.user_id=d.user_id LEFT JOIN pvp_deck_presets pr ON pr.user_id=a.user_id AND pr.preset_no=a.preset_no WHERE d.user_id IN (${m})`),
  readDuoEquipment(env,ids),
  p(`SELECT v.user_id,g.id,g.pvp_power,l.garage_id AS equipped FROM user_garage_vehicles v JOIN character_garage_items g ON g.id=v.garage_id LEFT JOIN user_garage_loadout l ON l.user_id=v.user_id AND l.garage_id=v.garage_id WHERE v.user_id IN (${m}) AND g.is_active=1 LIMIT 65537`),
  p(`SELECT u.user_id,t.id,t.pve_power AS pvp_power,u.expires_at,l.title_id AS equipped FROM user_character_titles u JOIN character_titles t ON t.id=u.title_id LEFT JOIN user_title_loadout l ON l.user_id=u.user_id AND l.title_id=u.title_id WHERE u.user_id IN (${m}) AND t.is_active=1 AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP) LIMIT 65537`),
  p(`SELECT c.user_id,c.mercenary_code,l.mercenary_code AS equipped FROM user_mercenary_cards_v1 c LEFT JOIN user_mercenary_loadout_v1 l ON l.user_id=c.user_id AND l.mercenary_code=c.mercenary_code WHERE c.user_id IN (${m}) AND c.total_copies>0 LIMIT 2001`),
  deps.readBattleSettings(env),readMercenaryDocument(env),readMercenaryRuntime(env)
 ]);
 for(const rows of [owned,gear,vehicles,titles])if(rows.results.length>65536)throw duoError('PROFILE_SIZE','전력 평가 자료가 처리 한도를 초과했습니다. 운영자에게 문의하세요.');
 if(mercRows.results.length>2000)throw duoError('PROFILE_SIZE','용병 평가 자료를 확인하세요.');
 const baseline=deps.cardBattlePower({rarity:'FUR'},13,battle),profiles=[];
 const byUser=(rows,id)=>rows.results.filter(r=>Number(r.user_id)===id);
 for(const version of versions){
  const userId=Number(version.user_id),user={id:userId,role:version.role,nickname:version.nickname},cards=byUser(owned,userId).map(c=>({...c,id:String(c.id),power:deps.cardBattlePower(c,Number(c.breakthrough_level||0),battle)})),cardMap=new Map(cards.map(c=>[c.id,c])),best=strongestDuoCards(cards);
  const saved=decks.results.find(d=>Number(d.user_id)===userId),select=raw=>{const value=parsed(raw);return Array.isArray(value)?value.map(id=>cardMap.get(String(id))).filter(Boolean):[];};
  const attack=select(saved?.attack_ids),defense=select(saved?.defense_ids),slotBest=new Map();let equipment=0;
  for(const item of byUser(gear,userId)){const power=FORGE_RUNTIME_RELEASE_ENABLED&&Number(item.level)>0?forgePower(Number(item.total_power),Number(item.level)).pvp:Number(item.pvp_power);slotBest.set(item.slot,Math.max(slotBest.get(item.slot)||0,power));equipment+=power*Number(item.equipped_count||0);}
  let potentialEquipment=[...slotBest.values()].reduce((s,n)=>s+n,0),expires=now+300000;
  for(const source of [vehicles,titles]){const list=byUser(source,userId);potentialEquipment+=Math.max(0,...list.map(r=>Number(r.pvp_power)));equipment+=list.filter(r=>r.equipped).reduce((s,r)=>s+Number(r.pvp_power),0);for(const r of list)if(r.expires_at)expires=Math.min(expires,Date.parse(String(r.expires_at).includes('T')?r.expires_at:r.expires_at.replace(' ','T')+'Z'));}
  const mercs=byUser(mercRows,userId).map(r=>({...battleConfig(mercDocument.document,r.mercenary_code,1),combat:mercRuntime.combat,equipped:Boolean(r.equipped),cmsRevision:mercDocument.revision}));
  const mercenary=mercs.find(m=>m.equipped)||null,mercenaryPower=best.length===5?Math.max(0,...mercs.map(m=>duoMercenaryRating(m,best,potentialEquipment,config.mercenaryWeights[m.code]??1))):0;
  const cardPower=best.reduce((s,c)=>s+c.power,0),power=Math.max(1,Math.round(100*(cardPower+potentialEquipment+mercenaryPower)/Math.max(1,baseline)));
  const valid=deck=>{try{validateDuoDeck(deck);return true;}catch{return false;}};
  profiles.push({userId,user,nickname:version.nickname,sourceVersion:Number(version.source_version),policyRevision:Number(version.policy_revision),power,expiresAt:new Date(expires).toISOString(),breakdown:{baseline,cardPower,equipmentPower:potentialEquipment,mercenaryPower,fur13Count:cards.filter(c=>c.rarity==='FUR'&&Number(c.breakthrough_level)>=13).length,superstarLevel:Math.max(-1,...cards.filter(c=>c.rarity==='SUPERSTAR').map(c=>Number(c.breakthrough_level))),mercenaryRanks:mercs.map(m=>({code:m.code,rank:m.rank}))},attackReady:valid(attack),defenseReady:valid(defense),attack:{ownerId:userId,ownerName:version.nickname,cards:attack,equipmentBonus:equipment,mercenary,presetNo:Number(saved?.preset_no||1)},defense:{ownerId:userId,ownerName:version.nickname,cards:defense,equipmentBonus:equipment,mercenary,presetNo:1}});
 }
 const entries=profiles.flatMap(p=>[p.attack,p.defense].map(squad=>({user:p.user,cards:squad.cards,squad}))),[unique,synergy,magic]=await Promise.all([
  deps.cardUniqueDeckStates(env,entries,'PVP',{fresh:true,batched:true}),deps.evaluateDeckSynergiesBatch(env,entries.map(e=>({user:e.user,deckIds:e.cards.map(c=>c.id)})),'PVP'),
  deps.duoMagicLoadouts?deps.duoMagicLoadouts(env,entries.map(e=>({userId:e.user.id,presetNo:e.squad.presetNo}))):Promise.all(entries.map(e=>deps.magicBattleLoadout(env,e.user,'PVP',{presetNo:e.squad.presetNo})))
 ]);
 entries.forEach((e,i)=>{const uniqueMap=new Map((unique[i]?.cards||[]).map(c=>[String(c.id),c])),mult=1+Number(synergy[i]?.totals?.attackPercent||0)/100;e.squad.cards=e.cards.map(c=>({...c,power:Math.max(1,Math.floor(c.power*mult)),uniqueAbility:uniqueMap.get(c.id)?.uniqueAbility||null,uniqueAdvancement:uniqueMap.get(c.id)?.uniqueAdvancement||null}));e.squad.magicCards=magic[i]?.cards||[];});
 const fresh=await duoVersions(env,ids),valid=profiles.filter(p=>fresh.some(v=>Number(v.user_id)===p.userId&&Number(v.source_version)===p.sourceVersion&&Number(v.policy_revision)===p.policyRevision));
 if(valid.length!==profiles.length)throw duoError('PROFILE_CHANGED','덱 또는 장비가 변경됐습니다. 다시 시도하세요.');
 for(const profile of profiles)profile.singleHealerBonus=deps.battleEngineState?.(battle,profile.user)?.singleHealerBonus||{};
 await env.DB.batch(profiles.map(p=>env.DB.prepare(`INSERT INTO ranked_duo_profiles_v1(user_id,source_version,policy_revision,config_hash,power,payload_json,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET source_version=excluded.source_version,policy_revision=excluded.policy_revision,config_hash=excluded.config_hash,power=excluded.power,payload_json=excluded.payload_json,expires_at=excluded.expires_at WHERE ranked_duo_profiles_v1.source_version<=excluded.source_version AND ranked_duo_profiles_v1.policy_revision<=excluded.policy_revision`).bind(p.userId,p.sourceVersion,p.policyRevision,hash,p.power,JSON.stringify(p),p.expiresAt)));
 return profiles;
}
export async function loadDuoProfiles(env,userIds,config,deps,{now=Date.now()}={}){
 const ids=[...new Set(userIds.map(numeric))];if(!ids.length)return [];if(ids.length>DUO_LIMITS.refreshBatch||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw duoError('PROFILE_USERS','전력 평가 범위를 확인하세요.');
 const hash=await jointHash({weights:config.mercenaryWeights}),versions=await duoVersions(env,ids);
 if(versions.length!==ids.length||versions.some(v=>v.status!=='ACTIVE'||['OWNER','ADMIN'].includes(v.role)||v.banned_until&&Date.parse(v.banned_until)>now))throw duoError('ACCOUNT','참가 계정 상태를 확인하세요.');
 const hit=[],miss=[];
 for(const v of versions){if(v.payload_json&&Number(v.source_version)===Number(v.cached_version)&&Number(v.policy_revision)===Number(v.cached_policy)&&v.config_hash===hash&&Date.parse(v.expires_at)>now){const cached=parsed(v.payload_json,{});hit.push({...cached,nickname:v.nickname,attack:{...cached.attack,ownerName:v.nickname},defense:{...cached.defense,ownerName:v.nickname}});}else miss.push(v);}
 let rebuilt=[];
 if(miss.length){
  const token=crypto.randomUUID(),expires=new Date(now+30000).toISOString(),at=new Date(now).toISOString();
  await env.DB.batch(miss.map(v=>env.DB.prepare('INSERT INTO ranked_duo_profile_leases_v1(user_id,token,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE ranked_duo_profile_leases_v1.expires_at<=?').bind(Number(v.user_id),token,expires,at)));
  try{
   const leases=(await env.DB.prepare(`SELECT user_id,token FROM ranked_duo_profile_leases_v1 WHERE user_id IN (${marks(miss)})`).bind(...miss.map(v=>Number(v.user_id))).all()).results;
   if(leases.length!==miss.length||leases.some(l=>l.token!==token))throw duoError('PROFILE_BUILDING','최신 전력을 반영 중입니다. 잠시 후 다시 시도하세요.');
   rebuilt=await rebuild(env,miss,config,deps,hash,now);
  }finally{await env.DB.prepare(`DELETE FROM ranked_duo_profile_leases_v1 WHERE token=? AND user_id IN (${marks(miss)})`).bind(token,...miss.map(v=>Number(v.user_id))).run();}
 }
 const all=new Map([...hit,...rebuilt].map(p=>[p.userId,p]));return ids.map(id=>all.get(id));
}
