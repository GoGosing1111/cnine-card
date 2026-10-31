import fs from 'node:fs';
import assert from 'node:assert/strict';
const before=JSON.parse(fs.readFileSync(new URL('./before.json',import.meta.url),'utf8'));
const ids=new Set(before.cards.map(c=>c.id));
const response=await fetch('https://cnine-card.pages.dev/api/cards',{cache:'no-store',signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);const data=await response.json();assert(Array.isArray(data.cards));
const present=data.cards.filter(c=>ids.has(String(c.id)));assert.deepEqual(present,[]);
const report={checkedAt:new Date().toISOString(),endpoint:'/api/cards',status:response.status,publicCards:data.cards.length,retiredTargetCardsVisible:present.length,expectedRetiredCards:ids.size,readOnly:true};
fs.writeFileSync(new URL('./public.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
