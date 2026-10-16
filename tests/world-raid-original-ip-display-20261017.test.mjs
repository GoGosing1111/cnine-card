import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {presentOriginalIpResponse,originalRaidPresentation} from '../shared/monster-original-ip-presentation-v1.mjs';

const bosses=[
  {id:4,code:'NAGATO',name:'나가토',expected:'오르제'},
  {id:6,code:'YORIICHI',name:'요리이치',expected:'렌조'},
  {id:8,code:'ICHIGO',name:'이치고',expected:'제노'}
];
const profile=b=>({id:b.id,code:b.code,name:b.name,image:'old-source.jpg',sourceArt:'old-source.jpg',battleSprite:'old-sd.webp',powerRating:5_000_000,maxHp:200_000_000,defenseRate:22,isActive:true,openCost:300_000,ownerTestVisible:false,weekday:6,dayLabel:'토'});
test('all three world raid opening choices match the approved weekly boss name and artwork',()=>{
  for(const boss of bosses){
    const row=profile(boss),entry=originalRaidPresentation(boss.id);
    const input={current:null,availableBosses:[row],weeklyBosses:[row],todayBoss:row,rooms:[],settings:{dailyEntries:2},dailyEntry:{count:1,limit:2,remaining:1},slotEntry:{id:'EVENING',count:0,limit:1,remaining:1},schedule:{isOpen:true,canEnter:true}};
    const before=structuredClone(input),out=presentOriginalIpResponse('raid/status',input);
    const expected={...row,name:boss.expected,image:entry.sourceArt,sourceArt:entry.sourceArt,battleSprite:entry.battleSprite};
    assert.deepEqual(out.availableBosses,[expected]);
    assert.deepEqual(out.availableBosses[0],out.weeklyBosses[0]);
    assert.deepEqual(out.availableBosses[0],out.todayBoss);
    for(const key of ['settings','dailyEntry','slotEntry','schedule','rooms','current'])assert.deepEqual(out[key],input[key]);
    assert.deepEqual(input,before);
    assert.deepEqual(presentOriginalIpResponse('raid/status',out),out);
  }
});
test('unknown opening choices and unrelated content retain their original fields',()=>{
  const row={id:99999,name:'새 보스',image:'new.png',battleSprite:'new-sd.png',openCost:999};
  const input={availableBosses:[row],current:null};
  assert.deepEqual(presentOriginalIpResponse('raid/status',input),input);
  assert.equal(presentOriginalIpResponse('me/collection',input),input);
});
test('the actual weekly roster caption is derived from the displayed names, deduplicated and escaped',async()=>{
  const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
  const source=app.slice(app.indexOf('function raidWeeklyBossStrip('),app.indexOf('function raidMinionMarkup('));
  const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const render=vm.runInNewContext(source+'\nraidWeeklyBossStrip',{escapeHtml});
  const rows=[bosses[0],bosses[0],bosses[1],bosses[2],bosses[0],bosses[1],bosses[2]].map((boss,weekday)=>({...profile(boss),weekday}));
  const data=presentOriginalIpResponse('raid/status',{weeklyBosses:rows,todayBoss:rows[6]});
  const html=render(data);
  assert.match(html,/<span>오르제 · 렌조 · 제노 3종 로테이션<\/span>/);
  assert.doesNotMatch(html,/나가토|요리이치|이치고|old-source\.jpg|old-sd\.webp/);
  assert.equal((html.match(/<article /g)||[]).length,7);
  assert.equal((html.match(/>TODAY</g)||[]).length,1);
  assert.equal(render({weeklyBosses:[]}), '');
  const changed=render({weeklyBosses:[{...data.weeklyBosses[0],name:'새 <보스>'}]});
  assert.match(changed,/<span>새 &lt;보스&gt; 1종 로테이션<\/span>/);
});
