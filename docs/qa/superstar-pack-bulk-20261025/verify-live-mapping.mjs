import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const out=process.argv[2]||import.meta.dirname,release=JSON.parse(fs.readFileSync(out+'/deployment-result.json'));
const [packs,app]=await Promise.all([fetch('https://cnine-card.pages.dev/api/packs').then(r=>r.json()),fetch('https://cnine-card.pages.dev/js/app.js?qa='+release.head).then(r=>r.text())]);
const section=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a))),context=vm.createContext({PACKS:[],selectedPackId:'superstar',superstarPackAccess:()=>({owner:false,early:false}),escapeHtml:s=>String(s),packArt:()=>''});
vm.runInContext(section('function packRangeFromAllowed(','const BURNING_EVENT_SYNC_KEY=')+section('function superstarPackHero(pack) {','function limitedMercenaryPackHero'),context);
context.applyServerPacks(packs.packs);const pack=context.PACKS.find(p=>p.id==='superstar'),html=context.superstarPackHero(pack),counts=[...html.matchAll(/data-superstar-bulk="(\d+)"/g)].map(m=>Number(m[1]));assert.deepEqual(counts,[1000,10000]);
const result={at:new Date().toISOString(),head:release.head,source:'live API packs + live app normalization + live shop renderer',counts,price:pack.price,successRate:pack.successRate,accountWrites:0};fs.writeFileSync(out+'/live-client-mapping.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
