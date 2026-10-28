import fs from 'node:fs';
import {createHuntSession} from '../sustained-hunt-v2/session.mjs';
import {limitedDeploymentSnapshot} from '../../shared/mercenary-limited-deployment-v1.mjs';
import fixture from '../../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {AREA_CUTIN_PROFILES as PROFILES} from '../../shared/mercenary-area-cutins-v1.mjs';
const root=new URL('../../',import.meta.url);
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(new URL('assets/ui/project-v/characters/'+p,root)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const cards=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payloads={};
for(const p of PROFILES){
 const mercenary={...limitedDeploymentSnapshot(p.code),combat:fixture.combat};
 const payload=createHuntSession({snapshot:{cards,mercenary,accountNickname:'SSS 컷신 검수'},seed:7919,limitMs:15000}).payload;
 // No full fight or settlement is played in this visual review.
 payload.battleV2.result.timeline=[];payloads[p.code]=payload;
}
fs.writeFileSync(new URL('fixtures.json',import.meta.url),JSON.stringify({schema:1,localSimulation:true,accountWrites:0,payloads}));
console.log('Prepared five local server-generated formations. No account/API writes.');
