import fs from 'node:fs';
import {createCityBattle} from '../functions/_jokgak_city_battle.js';
import {defaultCityArsenal} from '../shared/jokgak-city-expansion-v1.mjs';
const base=new URL('../preview/jokgak-city-v1/',import.meta.url),source=JSON.parse(fs.readFileSync(new URL('battle-fixture.json',base),'utf8'));
for(const weapon of [{code:null,power:100000},...defaultCityArsenal().weapons]){
 const battleV2=createCityBattle({attackerCards:source.attackerCards,defenderCards:source.defenderCards,attackerMercenary:source.battleV2.teams.A.mercenaries?.[0],defenderMercenary:source.battleV2.teams.B.mercenaries?.[0],attackerPower:weapon.power,defenderPower:100000,seed:20261009});
 const payload={...source,battleV2,attackerCards:source.attackerCards.map((c,i)=>({...c,power:battleV2.teams.A.cards[i].power})),defenderCards:source.defenderCards.map((c,i)=>({...c,power:battleV2.teams.B.cards[i].power})),attackerPower:weapon.power,defenderPower:100000};
 fs.writeFileSync(new URL('battle-fixture'+(weapon.code?'-'+weapon.code.toLowerCase():'')+'.json',base),JSON.stringify(payload));
}
