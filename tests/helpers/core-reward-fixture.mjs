import {coreLifecycleFixture} from './core-raid-lifecycle-fixture.mjs';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from '../../functions/_mercenary_draw_accounting.js';
import {ensureJointAtomicSchema} from '../../functions/_joint_atomic.js';
import {CORE_REWARD_KEY} from '../../functions/_core_raid_rewards.js';
import {CORE_REWARD_DEFAULT} from '../../shared/core-raid-reward-policy-v1.mjs';
export async function coreRewardFixture(dialect='sqlite'){
  const f=await coreLifecycleFixture(dialect),DB=f.env.DB;
  await ensureJointAtomicSchema(f.env);
  const schema=[...MERCENARY_ACCOUNTING_SCHEMA,
    'ALTER TABLE users ADD COLUMN magic_crystals BIGINT DEFAULT 0',
    'ALTER TABLE cnine_user_inventory ADD COLUMN created_at TEXT',
    'CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
    'CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT)',
    'CREATE TABLE magic_crystal_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,slot TEXT,sort_order INTEGER,is_active INTEGER,is_public INTEGER)',
    `CREATE TABLE user_equipment_instances(id ${dialect==='postgres'?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT'},user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE)`,
    'CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER)'
  ];
  for(const sql of schema){if(dialect==='postgres')await f.db.exec(sql);else await f.run(sql);}
  await f.run("INSERT INTO mercenary_cms_documents_v1 VALUES('config',?,1)",JSON.stringify(MERCENARY_CMS_SEED.document));
  await f.run("INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES('MASTER_STAR','마스터의 별','LEGENDARY','assets/items/master-star.png',1),('MAT','코어 파편','RARE','',1),('EQUIPMENT_PROTECTION_TICKET','장비보호권','RARE','',1)");
  await f.run("INSERT INTO character_equipment_items VALUES(1,'회수 장비','MYTHIC','', 'WEAPON',0,1,1)");
  const core={...f.settings,mode:'ON',rewardLocked:false,rewardCoin:10000000000,rewardShards:0};
  await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(core),'raid_core_protocol_settings_v2024');
  await f.run("UPDATE raid_core_rooms_v2024 SET status='CLEAR',boss_hp=0,completed_at=CURRENT_TIMESTAMP WHERE room_id=?",f.roomId);
  const policy={...structuredClone(CORE_REWARD_DEFAULT),enabled:true,revision:1,minimum:{rewardType:'MASTER_STAR',quantity:2,weight:100}};
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',CORE_REWARD_KEY,JSON.stringify(policy));
  const open=(roomId=f.roomId,user=1)=>f.call('raid/core/rewards/open',{roomId},{user});
  const setChoices=async(rewards,roomId=f.roomId,user=1)=>{
    const opened=await open(roomId,user);if(opened.status!==200)throw Error(JSON.stringify(opened));
    const offerId=opened.body.offerId,row=await f.row('SELECT response_json FROM raid_core_receipts_v2024 WHERE request_id=?',offerId),value=JSON.parse(row.response_json);
    value.choices=[0,1,2].map(i=>rewards[i]||rewards[0]);await f.run('UPDATE raid_core_receipts_v2024 SET response_json=? WHERE request_id=?',JSON.stringify(value),offerId);
    return opened.body;
  };
  const claim=(offer,index=0,extra={},user=1)=>f.call('raid/core/claim',{roomId:offer.roomId,offerId:offer.offerId,selectedIndex:index,requestId:offer.offerId+'-CLAIM',...extra},{user});
  const admin=(body,role='OWNER')=>import('../../functions/_raid_core_protocol.js').then(({handleRaidCoreProtocol})=>handleRaidCoreProtocol({path:'admin/raid/core/rewards',env:f.env,deps:{...f.deps,authenticate:async()=>({id:1,role})},request:new Request('https://qa.invalid/api/admin/raid/core/rewards',{method:body?'POST':'GET',headers:{origin:'https://qa.invalid','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}));
  return {...f,DB,policy,open,setChoices,claim,admin};
}
