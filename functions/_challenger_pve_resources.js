import {knownChallengerInventoryItem,challengerResourceCategory} from '../shared/challenger-pve-rewards-v1.mjs';

// Resolve newly configured CMS items once, before the battle or choice is frozen.
export async function additionalChallengerResources(db,refs){
  const codes=[...new Set(refs)].filter(code=>code&&!knownChallengerInventoryItem(code));
  const eligible=[];
  for(let i=0;i<codes.length;i+=80){
    const batch=codes.slice(i,i+80),marks=batch.map(()=>'?').join(',');
    const {results}=await db.prepare('SELECT code,category FROM inventory_items WHERE code IN ('+marks+')').bind(...batch).all();
    for(const row of results)if(challengerResourceCategory(row.category))eligible.push(row.code);
  }
  return eligible;
}
