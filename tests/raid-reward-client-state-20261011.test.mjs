import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const between=(start,end)=>{
  const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a);
  return app.slice(a,b);
};
const source=between('let raidState=','\nfunction raidCombatCard')+'\n'+between('function renderRaidView(d){','\nasync function claimRaidReward');
function setup({claimed=0,revealed=true,receiptStatus='READY',receiptId=5794,lastRaid=null}={}){
  const storage=new Map([['cnine_raid_claimed_5794','1']]);
  if(revealed)storage.set('cnine_raid_result_revealed_5794','1');
  const box={innerHTML:'',querySelector:()=>null},buttons=new Map();
  let loads=0,claims=0;
  const me={userId:17,rewardClaimed:claimed,shownDamage:123400,maxHp:100,currentHp:100};
  const data={settings:{title:'월드 레이드'},schedule:{isOpen:true,canEnter:true},rooms:[],current:{id:5794,status:'ENDED',result:'CLEAR',bossName:'나가토',startsAt:'2026-10-11T11:54:03Z',endsAt:'2026-10-11T11:55:59Z',currentHp:0,maxHp:1600000000},participants:[me],me,lastRaid,claimableReward:{instanceId:receiptId,receiptStatus,source:'SERVER_CONFIRMED',coin:3000000000,shards:3,magicCrystals:1000}};
  const context=vm.createContext({data,console,Map,Set,Date,Number,String,Math,Boolean,
    document:{hidden:false,getElementById(id){if(id==='pveRaidView')return box;if(!box.innerHTML.includes(`id="${id}"`))return null;if(!buttons.has(id))buttons.set(id,{disabled:false,addEventListener(){}});return buttons.get(id)}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    escapeHtml:value=>String(value??''),loadUser:()=>({id:17,serverUserId:17}),raidWeeklyBossStrip:()=>'',
    setTimeout:()=>1,clearTimeout(){},claimRaidReward(){claims++},loadRaidView:async()=>{loads++}
  });
  vm.runInContext(source+'\nraidState.data=data;raidState.selectedRoomId=data.current.id;',context);
  return {context,box,buttons,storage,render:()=>vm.runInContext('renderRaidView(data)',context),counts:()=>({loads,claims})};
}

for(const claimed of [0,'0'])test(`unclaimed server reward survives obsolete local claimed marker (${typeof claimed})`,()=>{
  const h=setup({claimed});h.render();
  assert.match(h.box.innerHTML,/RAID RESULT DETAIL/);
  assert.doesNotMatch(h.box.innerHTML,/이미 보상 정산이 완료/);
  assert.equal(h.buttons.get('raidClaim')?.disabled,false);
  assert.equal(h.buttons.get('raidClaim')?.textContent,'보상 받기');
  assert.deepEqual(h.counts(),{loads:0,claims:0},'showing a reward does not claim it');
});

test('result continue advances despite an obsolete browser claimed marker',async()=>{
  const h=setup({revealed:false});h.render();
  assert.match(h.box.innerHTML,/raidResultContinue/);
  await vm.runInContext('revealRaidResult(5794)',h.context);
  assert.match(h.box.innerHTML,/RAID RESULT DETAIL/);
  assert.equal(h.buttons.get('raidClaim')?.disabled,false);
  assert.deepEqual(h.counts(),{loads:1,claims:0});
});

for(const [label,options] of [
  ['participant',{claimed:'1'}],
  ['receipt',{receiptStatus:'COMPLETED'}],
  ['last raid',{lastRaid:{id:5794,rewardClaimed:true}}]
])test(`server ${label} settlement still prevents a second reward button`,()=>{
  const h=setup(options);h.render();
  assert.doesNotMatch(h.box.innerHTML,/id="raidClaim"/);
  assert.deepEqual(h.counts(),{loads:0,claims:0});
});

test('another instance receipt cannot hide the current unclaimed reward',()=>{
  const h=setup({receiptStatus:'COMPLETED',receiptId:5787});h.render();
  assert.match(h.box.innerHTML,/RAID RESULT DETAIL/);
  assert.equal(h.buttons.get('raidClaim')?.disabled,false);
});

test('settled result provides a way back to a fresh room list',async()=>{
  const h=setup({claimed:1});h.render();
  const back=h.buttons.get('raidSettledRefresh');
  assert.equal(typeof back?.onclick,'function');
  await back.onclick();
  assert.equal(vm.runInContext('raidState.selectedRoomId',h.context),0);
  assert.deepEqual(h.counts(),{loads:1,claims:0});
});
