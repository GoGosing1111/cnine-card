import {buildMonsterFighter,publicFighter} from './_battle_v2_preview.js';
import {createCooperativeBattle} from './_cooperative_battle.js';
import {regionalDifficulty} from '../shared/legion-regions-v1.mjs';
import {HUNT_DURATION_MS,CAPACITY} from '../preview/sustained-hunt-v2/hunt-rules.mjs';

const c=regionalDifficulty('calamity'),forge='/assets/ui/cooperative-arke-v1/';
export const CITADEL_CHUNK_MS=30000;
const species=[
 ['ASH_HOUND','잿불 사냥개','/assets/ui/cooperative-roster-v3/ironhound-768.webp',c.power*2,220,150,0],
 ['EMBER','화염 감시기',forge+'ember-watcher-v1.png',c.power*1.6,170,165,0],
 ['GUARD','흑철 근위병',forge+'forge-stalker-v1.png',c.power*2.8,260,165,12],
 ['WARDEN','용광로 파수병',forge+'core-warden-v1.png',c.power*3.4,280,180,18],
 ['CASTELLAN','잿불 성주 몰록','/preview/scrapyard-v3-v1/assets/moloch-sd-v1.png',c.bossPower*1.1,650,185,32],
];
export function citadelEnemies(){
 const monsters=species.map(([code,name,art,power,hp,attack,shield],i)=>({id:'CITADEL_'+code,name,isBoss:i===4,battle_power:Math.round(power),pve_hp_percent:hp,pve_attack_percent:attack,pve_defense_percent:100,pve_shield_percent:shield,pve_attack_count:i===4?2:1,pve_forced_action_every:3,battleSprite:art,image:art,attackStyle:code==='EMBER'?'RANGED':'MELEE',projectVMonsterArt:{scope:'BATTLE_ENGINE_ONLY',kind:'CITADEL_'+code,primaryUrl:art,pngFallbackUrl:art,footAnchor:{x:.5,y:.94},scaleMultiplier:1,objectFit:'contain',objectPosition:'50% 100%'}}));
 const forms=monsters.map((m,i)=>({...buildMonsterFighter(m),id:'B:T:'+i,slot:i,huntArtId:i,battleSprite:m.battleSprite,projectVMonsterArt:m.projectVMonsterArt,displayHeight:i===4?320:155,legionRegion:'CITADEL',legionRole:i===1?'SUPPORT':'ASSAULT'}));
 const initial=Array.from({length:CAPACITY},(_,slot)=>({...forms[slot%4],slot,id:'B:'+slot+':CITADEL'}));
 return {monster:monsters.at(-1),initial,pending:[],forms,encounter:{schemaVersion:1,initialIds:initial.map(f=>f.id),instances:initial.map(publicFighter)},
  sustained:{durationMs:c.huntDurationMs,continuousUntilMs:HUNT_DURATION_MS,regionId:'CITADEL',templates:forms.slice(0,4),finalBoss:{...forms[4],id:'B:4:CITADEL:BOSS',finalBoss:true}}};
}
export function buildCitadelBattle(squads,seed){
 if(squads.length!==2||squads.some(s=>s.cards.length!==2||s.cards.some(c=>(c.grade||c.rarity)!=='ICON')||s.mercenaries.length!==2))throw Error('Invalid citadel squads');
 const field=citadelEnemies(),{payload,states}=createCooperativeBattle({squads,seed,difficulty:{id:'CITADEL',forcedEvery:3},combat:{maxBattleSeconds:HUNT_DURATION_MS/1000,difficulties:[]},citadelEnemies:field});
 payload.sceneAssetKey='LEGION_BURNING_CITADEL';payload.accountNickname='성채 토벌대';
 const result=payload.battleV2.result,elapsed=result.timeline.at(-1).combatAtMs,won=result.final.A.concat(result.final.mercenaries.A).some(f=>f.hp>0)&&elapsed>=HUNT_DURATION_MS,duration=won?HUNT_DURATION_MS:Math.min(HUNT_DURATION_MS,Math.max(1000,Math.round(elapsed)));
 const instances=result.encounter.instances,byId=new Map(instances.map(f=>[f.id,f]));
 const kills=result.timeline.filter(e=>e.type==='KO'&&byId.has(e.targetId)).map(e=>[Math.round(e.combatAtMs),byId.get(e.targetId).isBoss?2:byId.get(e.targetId).huntElite?1:0]);
 const manifest=instances.map(f=>[f.slot,f.isBoss?-1:Number(f.id.split(':R')[1]||0),f.huntArtId,f.huntElite?1:0]);
 const units=states[0].A.map(({hp,shield,...f})=>({...f,side:'A'})),ids=new Map([...units.map((f,i)=>[f.id,i]),...instances.map((f,i)=>[f.id,i+units.length])]);
 const chunks=Array.from({length:Math.ceil(duration/CITADEL_CHUNK_MS)},()=>({frames:[],events:[]}));
 const chunk=t=>chunks[Math.min(chunks.length-1,Math.floor(t/CITADEL_CHUNK_MS))];let window=-1;
 for(const st of states){const t=Math.floor(st.atMs/1000);if(t===window)continue;window=t;const values=[];
  for(const f of [...st.A,...st.B]){if(ids.has(f.id))values.push(ids.get(f.id),f.hp,f.shield||0);}
  chunk(st.atMs).frames.push([st.atMs,values]);}
 for(const e of result.timeline){if(e.type==='RESULT')continue;const {combatClock,...event}=e;chunk(e.combatAtMs).events.push(event);}
 result.winner=won?'A':'B';result.reason=won?'TIME_LIMIT':'ELIMINATION';result.timeline=[];delete result.encounter;delete result.openingTeams;delete result.openingMercenaries;
 // All dates, targets and death rolls remain authoritative. Generations share one
 // template per species; the remaining six minutes never block first-frame decode.
 const forms=field.forms.map(({id,cardId,title,name,isBoss,battleSprite,attackStyle,displayHeight,maxHp,maxShield,projectVMonsterArt})=>({id,cardId,title,name,isBoss,battleSprite,attackStyle,displayHeight,maxHp,maxShield,projectVMonsterArt}));
 payload.cooperativeEncounter.citadel={manifest,forms};
 return {won,duration,kills,replay:{payload,units,chunkMs:CITADEL_CHUNK_MS,chunkCount:chunks.length},chunks};
}

