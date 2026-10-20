import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {originalRaidPresentation,presentOriginalIpResponse} from '../shared/monster-original-ip-presentation-v1.mjs';
import {MADARA_LINES,MADARA_PLANS} from '../functions/_raid_madara.js';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';

const varsen=originalRaidPresentation('MADARA');
test('saved raid cues, phase and result labels update without changing players or receipts',()=>{
  const input={requestId:'MADARA_saved_receipt',state:{
    phase:3,phaseName:'화둔 결계',bossHp:12345,
    presentation:{key:'FIRE',id:'room:12',at:100,title:'화둔 · 타오르는 전장',line:'살아남을 곳은 단 하나. 찾아 보아라.',effect:'fire'},
    failure:{code:'ENRAGE',reason:'360초 경과 · 마다라가 전장을 붕괴시켰습니다.'},
    members:[{id:'1',name:'마다라',hp:321}],
    events:[{type:'MADARA_PHASE',label:'완전체 강림',presentation:{key:'FINAL',title:'완전체 · 거신 강림',effect:'awakening'}},
      {type:'BOSS_ULTIMATE',label:'마다라 반격',hits:[{targetId:'1',damage:17}]},
      {type:'MADARA_TASK',label:'마다라 · 동료 보호 완료',ownerId:'1'},
      {type:'MADARA_RESULT',label:'마다라 레이드 공략 성공',winner:'A'}]}};
  const before=structuredClone(input);
  for(const route of ['raid/madara/state','raid/madara/action']){
    const out=presentOriginalIpResponse(route,input);
    assert.equal(out.state.presentation.title,MADARA_LINES.FIRE.title);
    assert.equal(out.state.phaseName,MADARA_PLANS[2].name);
    assert.equal(out.state.events[0].presentation.title,MADARA_LINES.FINAL.title);
    assert.equal(out.state.events[0].label,MADARA_PLANS[4].name);
    assert.match(out.state.failure.reason,/바르센이/);
    assert.equal(out.state.events[1].label,'바르센 반격');
    assert.equal(out.state.events[3].label,'바르센 레이드 공략 성공');
    assert.deepEqual(out.state.members,input.state.members);
    assert.deepEqual(out.state.events[2],input.state.events[2]);
    assert.deepEqual(out.state.events[1].hits,input.state.events[1].hits);
    assert.equal(out.state.presentation.id,'room:12');assert.equal(out.state.presentation.at,100);
    assert.equal(out.requestId,input.requestId);assert.equal(out.state.bossHp,12345);
  }
  assert.deepEqual(input,before);
  assert.equal(presentOriginalIpResponse('me/collection',input),input);
});

test('owned legacy tickets use Varsen name, art and help while preserving balances',()=>{
  const ticket={code:'MADARA_RAID_ENTRY_TICKET',name:'마다라 레이드 입장권',subtitle:'MADARA RAID ENTRY',
    image:'preview/madara-raid-v1/assets/animation/cast-03.png',quantity:7,unseenQuantity:2,usable:false,
    useDisabledMessage:'마다라 레이드 공대 생성 시 사용',description:'공대장만 소모'};
  const other={code:'ANOTHER_ITEM',name:'마다라',image:'unchanged.png',quantity:3};
  const input={items:[ticket,other],totalQuantity:10,ownedTypes:2,unseenTotal:2},before=structuredClone(input);
  const out=presentOriginalIpResponse('inventory',input);
  assert.equal(out.items[0].name,'바르센 레이드 입장권');
  assert.equal(out.items[0].subtitle,'VARSEN RAID ENTRY');
  assert.equal(out.items[0].image,varsen.battleSprite);
  assert.equal(out.items[0].useDisabledMessage,'바르센 레이드 공대 생성 시 사용');
  for(const key of ['code','quantity','unseenQuantity','usable','description'])assert.equal(out.items[0][key],ticket[key]);
  assert.equal(out.items[1],other);assert.equal(out.totalQuantity,10);assert.deepEqual(input,before);
});

test('live catalog refresh updates only existing ticket display fields',async()=>{
  const f=await madaraLiveFixture();
  try{
    await f.run("INSERT INTO inventory_items(code,name,subtitle,image_url,description,category,rarity,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,?)",
      'MADARA_RAID_ENTRY_TICKET','마다라 레이드 입장권','MADARA RAID ENTRY','old.png','보존 설명','ENTRY_TICKET','ZENITH',128,1);
    const before=await f.one("SELECT * FROM cnine_user_inventory WHERE user_id=1 AND item_code='MADARA_RAID_ENTRY_TICKET'");
    assert.equal((await f.call('lobby')).status,200);
    const item=await f.one("SELECT * FROM inventory_items WHERE code='MADARA_RAID_ENTRY_TICKET'");
    assert.equal(item.name,'바르센 레이드 입장권');assert.equal(item.subtitle,'VARSEN RAID ENTRY');assert.equal(item.image_url,varsen.battleSprite);
    assert.equal(item.description,'보존 설명');assert.equal(item.category,'ENTRY_TICKET');assert.equal(item.sort_order,128);assert.equal(item.is_active,1);
    assert.deepEqual(await f.one("SELECT * FROM cnine_user_inventory WHERE user_id=1 AND item_code='MADARA_RAID_ENTRY_TICKET'"),before);
  }finally{await f.close();}
});

test('raid regeneration keeps approved portraits, new labels and existing reward reveal lifecycle',()=>{
  const files=['raid/madara/fragment.html','raid/madara/live.css','raid/madara/runtime.mjs'];
  const read=file=>readFileSync(file,'utf8').replaceAll('\r\n','\n');
  const before=files.map(read);
  const staging=mkdtempSync(join(tmpdir(),'varsen-build-test-'));
  try{
    const inputs=['index.html','madara.css','mechanics.css','madara.js','presentation.js','battle.js','mechanics-ui.js'].map(file=>'preview/madara-raid-v1/'+file).concat(['raid/madara/runtime-scope.mjs','raid/madara/combat-screen.css']);
    for(const file of inputs){mkdirSync(dirname(join(staging,file)),{recursive:true});copyFileSync(file,join(staging,file));}
    execFileSync(process.execPath,[resolve('scripts/build-madara-live.mjs')],{stdio:'pipe',cwd:staging});
    files.forEach((file,i)=>assert.equal(read(join(staging,file)),before[i],file+' is reproducible'));
  }finally{
    assert.equal(dirname(resolve(staging)),resolve(tmpdir()));
    rmSync(staging,{recursive:true,force:true});
  }
  assert.doesNotMatch(before[0],/마다라|화둔|완전체|>忍</);
  assert.ok(before[1].includes("url('"+varsen.battleSprite+"')"));
  assert.doesNotMatch(before[1],/assets\/madara-battle-v1\.png/);
  assert.match(before[2],/mountRewardRevealButton\(\$\('resultDialog'\),reward\?\.choiceOffer/);
  assert.match(before[2],/revealLifecycle\.abort\(\);scope\.destroy\(\)/);
});
