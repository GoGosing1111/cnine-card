import fs from 'node:fs';
import assert from 'node:assert/strict';
const before=JSON.parse(fs.readFileSync(new URL('./before.json',import.meta.url),'utf8'));
const url='https://cnine-card.pages.dev/api/packs?cardguLimitVerification='+Date.now();
const response=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});assert(response.ok,'Public packs request failed');
const data=await response.json(),pack=data.packs.find(p=>p.id==='mercenary-blackcrown-ss-limited');assert(pack);
const card=pack.previewCards.find(c=>c.code==='V-970');assert.equal(card.name,'카드구');assert.equal(card.rank,'SSS');assert.equal(card.limit,7);
assert(card.issued>=Number(before.stock.issued)&&card.issued<=7);assert.equal(card.remaining,7-card.issued);
assert.deepEqual(pack.prices,before.document.settings.prices);
for(const c of pack.previewCards){if(c.code==='V-970'||c.limit==null)continue;assert.equal(c.limit,before.document.settings.stockLimits[c.code]);}
const report={verifiedAt:new Date().toISOString(),publicUrl:url,code:card.code,name:card.name,limit:card.limit,issued:card.issued,remaining:card.remaining,pricesPreserved:true,otherLimitsPreserved:true,pack};
fs.writeFileSync(new URL('./public.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({public:true,code:card.code,limit:card.limit,issued:card.issued,remaining:card.remaining,pricesPreserved:true,otherLimitsPreserved:true}));
