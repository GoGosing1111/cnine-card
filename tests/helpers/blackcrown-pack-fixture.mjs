import {limitedFixture} from './limited-pack-fixture.mjs';
import {BLACKCROWN_PACK_KEY,blackcrownPackDraft} from '../../shared/mercenary-blackcrown-pack-v1.mjs';
import {readBlackcrownPackState} from '../../functions/_mercenary_blackcrown_pack.js';
import {createBlackcrownPackService} from '../../functions/_mercenary_blackcrown_opening.js';
export async function blackcrownFixture(t,{randomInt=()=>0}={}){
 const f=await limitedFixture(t);await f.configure({enabled:false});
 await f.pg.exec('ALTER TABLE inventory_items ADD COLUMN name TEXT, ADD COLUMN subtitle TEXT, ADD COLUMN description TEXT, ADD COLUMN category TEXT, ADD COLUMN rarity TEXT, ADD COLUMN image_url TEXT, ADD COLUMN sort_order BIGINT');
 const settings=blackcrownPackDraft();settings.mode='ON';settings.prices={single:100,ten:900};settings.normalRankRatesPpm=Object.fromEntries(Object.keys(settings.normalRankRatesPpm).map(rank=>[rank,rank==='SSS'?1000000:0]));settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(code=>[code,code==='V-950'?1000000:0]));settings.missRatePpm=0;settings.normalSssRatePpm=0;
 for(const [code,limit] of Object.entries(settings.stockLimits))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',code,limit).run();
 const configure=async(revision=1)=>f.setting(BLACKCROWN_PACK_KEY,{revision,settings});await configure();
 const service=createBlackcrownPackService({readState:readBlackcrownPackState,randomInt});
 const own=async(code,copies=1)=>f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(1,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=excluded.total_copies,duplicate_count=excluded.duplicate_count',code,copies,Math.max(0,copies-1),new Date().toISOString(),new Date().toISOString()).run();
 return {...f,settings,configure,service,own,body:(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1}),state:()=>readBlackcrownPackState(f.env,{userId:1})};
}
