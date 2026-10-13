import fs from 'node:fs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const tiers=grade=>read('assets/ui/project-v/characters/'+grade.toLowerCase()+'/manifest-'+(grade==='FUR'?'v2':'v1')+'.json').characters;
const ordinary=(c,grade)=>({id:c.cardId,title:c.title,member:c.member,grade,rarity:grade,image:c.sourceArt,power:180000});
const fur=tiers('FUR').slice(0,2).map(c=>ordinary(c,'FUR'));
const zenith=tiers('ZENITH').filter(c=>c.cardId!=='CN-0505936A0CBB4E59').slice(0,2).map(c=>ordinary(c,'ZENITH'));
const superstar=ordinary(tiers('SUPERSTAR')[0],'SUPERSTAR');
const icon=(code,mode)=>{const c=ICON_LIVE_CARDS.find(c=>c.code===code);return {...c,id:c.cardId,title:c.name,rarity:'ICON',image:c.sourceArt,power:180000,iconRole:iconRoleSnapshot(c,defaultIconRoles(),mode)};};
const out='preview/icon-roles-v1/',results=[];
for(const mode of ['PVE','PVP']){
 const cards=[...fur,zenith[0],icon('ICON-OH-JOEUN',mode),icon('ICON-GUSUDAENG',mode)];
 const opponents=[...fur,...zenith,superstar],monster={id:1,name:'비법 배합 검수 수호자',image:'assets/cards/monster/sla2.jfif',battle_power:1400000};
 let battleV2;
 for(let seed=1;seed<=100;seed++){
  battleV2=mode==='PVE'?createPveBattleV2({cards,monster,seed}):createPvpBattleV2({attackerCards:cards,defenderCards:opponents,seed});
  if(battleV2.result.timeline.some(e=>e.type==='ICON_ECHO'))break;
 }
 if(!battleV2.result.timeline.some(e=>e.type==='ICON_ECHO'))throw Error('No actual link proc in '+mode);
 const file='icon-gusudaeng-'+mode.toLowerCase()+'.json';
 fs.writeFileSync(out+file,JSON.stringify({battleV2,cards,monster:mode==='PVE'?monster:undefined,mode,battlefieldMode:mode,playerName:'구수댕 ICON 검수',opponentName:mode==='PVE'?monster.name:'등급 제한 준수 검수 편성'}));
 results.push({code:'ICON-GUSUDAENG',mode,file,actions:battleV2.result.actions,casts:battleV2.result.timeline.filter(e=>e.type==='ICON_SKILL'&&e.iconCode==='ICON-GUSUDAENG').length,echoes:battleV2.result.timeline.filter(e=>e.type==='ICON_ECHO').length});
}
const manifest=read(out+'fixtures.json');manifest.results=manifest.results.filter(r=>r.code!=='ICON-GUSUDAENG').concat(results);fs.writeFileSync(out+'fixtures.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(results));
