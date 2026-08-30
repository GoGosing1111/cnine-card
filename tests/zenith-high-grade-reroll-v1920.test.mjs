import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('ZENITH is available throughout the high-grade reroll contract',async()=>{
  const [server,client,admin,api,index,adminIndex,worker]=await Promise.all([
    text('functions/_high_grade_reroll.js'),text('js/high-grade-reroll-v1354.js'),
    text('admin/high-grade-reroll-admin-v1354.js'),text('functions/api/[[path]].js'),
    text('index.html'),text('admin/index.html'),text('service-worker.js')
  ]);
  assert.match(server,/ALLOWED_GRADES=new Set\(\['PRESTIGE','LIMITED','FUR','ZENITH'\]\)/);
  assert.match(server,/zenithEnabled:value\?\.zenithEnabled!==false/);
  assert.match(server,/grade==='FUR'\?cfg\.furEnabled:cfg\.zenithEnabled/);
  assert.match(server,/PRESTIGE·LIMITED·FUR·ZENITH 카드만 재뽑기할 수 있습니다/);
  assert.match(client,/ZENITH:'zenithEnabled'/);
  assert.match(client,/PRESTIGE·LIMITED·FUR·ZENITH 카드/);
  assert.match(admin,/hgrZenithV1354/);
  assert.match(admin,/zenithEnabled:byId\('hgrZenithV1354'\)/);
  assert.match(api,/furEnabled:true,zenithEnabled:true/);
  assert.match(index,/js\/app\.js\?v=1935-battlefield-unique-fix/);
  assert.match(adminIndex,/high-grade-reroll-admin-v1354\.js\?v=1920-zenith-reroll/);
  assert.match(worker,/soop-card-shell-v1935-battlefield-unique-fix/);
});

test('chief fixed durations bypass operator CMS duration choices',async()=>{
  const api=await text('functions/api/[[path]].js');
  assert.match(api,/durationMinutes=isHyper\?60:180/);
  assert.match(api,/endsAt:chiefBurningEndsAt\(changedAt,durationMinutes\)/);
  assert.match(api,/function chiefBurningEndsAt\(startAt,durationMinutes\)/);
});
