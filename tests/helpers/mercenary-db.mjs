import {jointFixture} from './joint-db.mjs';
import {ensureMercenaryCms} from '../../functions/_mercenary_cms.js';
import {ensureMercenaryDrawCms} from '../../functions/_mercenary_draw_cms.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw} from '../../shared/mercenary-draw-policy-v1.mjs';
import {ensureMercenaryRuntimeSchema,MERCENARY_RUNTIME_DRAFT,MERCENARY_RUNTIME_KEY} from '../../functions/_mercenary_account.js';
export async function mercenaryFixture(t,options){
 const f=options?.base||await jointFixture(t,options);await ensureMercenaryCms(f.env,7);await ensureMercenaryDrawCms(f.env,7);await ensureMercenaryRuntimeSchema(f.env);
 const document=structuredClone(MERCENARY_CMS_SEED.document);for(const c of document.mercenaries){c.rank=MERCENARY_CMS_SEED.catalog.cards.find(a=>a.code===c.code).rank||'C';c.review='REVIEWED';c.stats={hp:10000,attack:1000,defense:100,speed:100};c.growth={maxLevel:10,hpPerLevel:100,attackPerLevel:10,defensePerLevel:1};}
 for(const r of document.settings.rankGrowth)Object.assign(r,{maxLevel:10,coinPerLevel:1000,expPerLevel:100});
 const draw=suggestedMercenaryDraw();for(const o of draw.outcomes)o.chancePpm=o.id==='CARD_C'?1000000:0;
 const policy={...structuredClone(MERCENARY_RUNTIME_DRAFT),mode:'TEST',opening:{paymentKind:'COIN',coinPerOpen:1000,itemCode:null,itemsPerOpen:null,maxBatch:10},training:{itemCode:'MERCENARY_TEST_EXP',experiencePerItem:100}};
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(document)).run();
 await f.p('UPDATE mercenary_draw_config_v1 SET payload_json=? WHERE id=1',JSON.stringify(draw)).run();await f.setting(MERCENARY_RUNTIME_KEY,policy);
 for(const code of ['MASTER_STAR','STARLIGHT_ARMOR_CORE','MERCENARY_TEST_EXP','MERCENARY_TEST_PACK']){await f.p('INSERT INTO inventory_items(code,name,rarity,image_url) VALUES(?,?,?,?)',code,code,'SPECIAL','/test.png').run();await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,100)',code).run();}
 return {...f,document,draw,policy,setDraw:async next=>f.p('UPDATE mercenary_draw_config_v1 SET payload_json=?,revision=revision+1 WHERE id=1',JSON.stringify(next)).run()};
}
