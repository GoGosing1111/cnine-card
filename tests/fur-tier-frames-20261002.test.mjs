import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const app=read('js/app.js');
const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const context=vm.createContext({window:{},uniqueAbilityBadgeHtml:()=>'',FAKER_CHAMPIONSHIP_CARD_ID:'faker',
  uniqueAbilityDominant:()=>null,deckAbilityIconHtml:()=>'',escapeHtml:String,powerTypeIndicatorHtml:()=>'',
  responsiveCardImageMarkup:()=>'<img src="photo.png">',drawResultRenderCount:0});
vm.runInContext(slice(app,'const TIER_FRAME_ASSETS=','const HIGH_BREAKTHROUGH_BONUS_FALLBACK=')+
  slice(app,'function cardHtml(','function showDetail('),context);

test('FUR +14/+15 resolve distinct overlays in dex, detail, PVE and PVP while +13 and other grades retain their limits',()=>{
  for(const level of [13,14,15])for(const classes of ['dex-card-display','','pve-deck-card-display','pvp-card-display']){
    const html=context.cardHtml({id:'fur',grade:'FUR',title:'FUR',name:'검수'},true,classes,{breakthroughs:{fur:level}});
    const file=level===13?'fur-tier-frame-13.png':`fur-tier-frame-${level}-v20261002.png`;
    assert.ok(html.includes(file));assert.ok(html.includes(`bt-tier-${level}`));
    assert.doesNotMatch(html,/undefined/);
  }
  for(const grade of ['ZENITH','SUPERSTAR'])assert.equal(context.tierFrameLevel(grade,15),13);
  assert.equal(context.tierFrameLevel('FUR',16),15);
  assert.equal(context.tierFrameLevel('SR',15),0);
  const faker=context.cardHtml({id:'faker',grade:'FUR'},true,'',{breakthroughs:{faker:15}});
  assert.match(faker,/faker-t1-championship-frame-v2/);assert.doesNotMatch(faker,/tier-card-frame/);
});

test('V2 and V3 battle card docks use the same +14/+15 files without replacing Faker or other grades',()=>{
  const v2=vm.createContext({window:{},FAKER_CHAMPIONSHIP_CARD_ID:'faker',esc:String,assetUrl:String,uniqueBadgeHtml:()=>''});
  vm.runInContext(slice(read('js/battle-v2-live.js'),'  function frameHtml(','  function cardHtml('),v2);
  const v3=vm.createContext({window:{},FAKER_CHAMPIONSHIP_CARD_ID:'faker',esc:String,FALLBACK_ART:'photo.png',
    dexCardFor:c=>c,rosterArt:()=>({url:'photo.png',focusX:50,focusY:50}),rosterKeys:c=>[c.id],rosterUniqueBadgeHtml:()=>''});
  vm.runInContext(slice(read('js/battle-v3-live.js'),'  function rosterCardHtml(','\n  function '),v3);
  for(const level of [14,15])for(const render of [c=>v2.frameHtml(c),c=>v3.rosterCardHtml(c,0,[])]){
    const card={id:'fur',grade:'FUR',breakthroughLevel:level,image:'photo.png'};
    assert.ok(render(card).includes(context.tierFrameSource('FUR',level)));
    assert.match(render(card),/has-tier-frame/);
    assert.doesNotMatch(render({...card,id:'faker'}),/tier-card-frame/);
    assert.doesNotMatch(render({...card,grade:'ZENITH'}),/tier-card-frame/);
  }
});

test('both overlays have real alpha, clear portrait windows, intact ornament and refreshed cache keys',async()=>{
  for(const level of [14,15]){
    const image=sharp(new URL(context.tierFrameSource('FUR',level),root).pathname.replace(/^\/C:/,'C:'));
    const metadata=await image.metadata();assert.equal(metadata.width,1024);assert.equal(metadata.height,1536);assert.equal(metadata.hasAlpha,true);
    const {data,info}=await image.raw().toBuffer({resolveWithObject:true});
    let max=0;
    for(let y=400;y<1300;y++)for(let x=240;x<784;x++)max=Math.max(max,data[(y*info.width+x)*4+3]);
    assert.ok(max<=1,'photo window must be transparent, without baked checkerboard');
    assert.ok(data[(130*1024+512)*4+3]>200,'top crest must remain visible');
  }
  const index=read('index.html'),worker=read('service-worker.js');
  assert.equal(index.match(/js\/app\.js\?v=([^&"]+)/)[1],worker.match(/soop-card-shell-v([^']+)/)[1]);
  assert.match(index,/breakthrough-tier-v1802.css\?v=20261002-fur14-15/);
});
