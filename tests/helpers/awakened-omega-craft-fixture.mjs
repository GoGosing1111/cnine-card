import {equipmentFixture} from './workshop-equipment-fixture.mjs';
import {ensureCraftAccounting,saveMercenaryCraft,decorateMercenaryCraft} from '../../functions/_mercenary_craft.js';
import {executeAwakenedOmegaCraft,awakenedOmegaCraftAccountState} from '../../functions/_workshop_awakened_omega.js';
import {draft} from '../../scripts/ops/awakened-omega-craft-20261029.mjs';
export async function omegaFixture(t,postgres=false,{register=true}={}){
 const f=await equipmentFixture(t,postgres);await ensureCraftAccounting(f.env);
 const schema=sql=>postgres?f.pg.exec(sql):f.p(sql).run();
 await schema('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT');
 await schema('CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)');
 await schema('CREATE TABLE user_mercenary_levels_v1(user_id BIGINT,mercenary_code TEXT,level INTEGER,experience BIGINT,revision INTEGER,PRIMARY KEY(user_id,mercenary_code))');
 for(const uid of [7,8]){
  await f.p('UPDATE users SET coin=2000000000000000 WHERE id=?',uid).run();
  await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(?,'V-021',1000,999,'2026-10-01','2026-10-28')",uid).run();
  await f.p("INSERT INTO user_mercenary_levels_v1 VALUES(?,'V-021',16,123,8)",uid).run();
 }
 f.omegaId=register?await saveMercenaryCraft(f.env,f.user,draft()):null;
 f.omegaCraft=(id,randomInt=()=>9999,user=f.user,body={})=>f.deps.withUserMutationLock(f.env,user.id,'workshop/awakened-omega-craft',()=>executeAwakenedOmegaCraft(f.env,user,{recipeId:f.omegaId,requestId:'qa-omega-craft-'+id,...body},{randomInt}));
 f.omegaRecipes=async()=>decorateMercenaryCraft(f.env,(await f.p('SELECT * FROM workshop_recipes_v1668').all()).results);
 f.omegaState=async(user=f.user)=>awakenedOmegaCraftAccountState(f.env,user,await f.omegaRecipes());
 f.copies=async(code='V-021',uid=7)=>Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',uid,code).first())?.total_copies||0);
 return f;
}
