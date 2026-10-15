import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ORIGINAL_IP_MONSTERS} from '../shared/monster-original-ip-data-v1.mjs';
import {presentOriginalIpResponse} from '../shared/monster-original-ip-presentation-v1.mjs';

test('content status uses the same current raid name as raid/status, preserving progress and non-raid titles',()=>{
  for(const entry of ORIGINAL_IP_MONSTERS.filter(row=>row.raidId))for(const oldName of entry.previousNames){
    const row={kind:'RAID',phase:'BATTLE',entityId:7519,title:oldName,detail:'참가자 17명',deadlineAt:'2026-10-16T12:00:00Z',sortOrder:5};
    const other={...row,kind:'AUCTION'},unknown={...row,title:'새로운 보스'};
    const input={items:[row,other,unknown],serverNow:'2026-10-16T11:45:00Z',pollSeconds:30},before=structuredClone(input);
    const actual=presentOriginalIpResponse('live-operations',input);
    assert.deepEqual(actual,{...input,items:[{...row,title:entry.name},other,unknown]});
    assert.equal(actual.items[0].title,presentOriginalIpResponse('raid/status',{current:{bossName:oldName}}).current.bossName);
    assert.deepEqual(input,before);
    assert.deepEqual(presentOriginalIpResponse('live-operations',actual),actual);
  }
  assert.deepEqual(presentOriginalIpResponse('live-operations',{items:[]}),{items:[]});
});

test('the cached public aggregate applies the projection and keeps its cache contract',async()=>{
  const api=await readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const route=api.slice(api.indexOf("if(path==='live-operations'"),api.indexOf("if(path==='live-operations'")+550);
  assert.match(route,/JSON\.stringify\(presentOriginalIpResponse\(path,\{items,/);
  assert.match(route,/pollSeconds:30/);
  assert.match(route,/public, max-age=10, stale-while-revalidate=20/);
});
