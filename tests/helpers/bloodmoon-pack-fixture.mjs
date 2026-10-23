import {limitedFixture} from './limited-pack-fixture.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {readBloodmoonPackState} from '../../functions/_mercenary_bloodmoon_pack.js';
import {createBloodmoonPackService} from '../../functions/_mercenary_bloodmoon_opening.js';
export async function bloodmoonFixture(t,{randomInt=()=>0}={}){
 const f=await limitedFixture(t);await f.configure({enabled:false});
 const settings=bloodmoonPackDraft();settings.mode='ON';settings.prices={single:100,ten:900};settings.normalRankRatesPpm=Object.fromEntries(Object.keys(settings.normalRankRatesPpm).map(rank=>[rank,rank==='SSS'?1000000:0]));settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(code=>[code,code==='V-960'?1000000:0]));settings.missRatePpm=0;settings.normalSssRatePpm=0;
 for(const [code,limit] of Object.entries(settings.stockLimits))if(limit!==null)await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',code,limit).run();
 for(const code of ['V-978','V-974','V-975'])await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,3,0)',code).run();
 const configure=async(revision=1)=>f.setting(BLOODMOON_PACK_KEY,{revision,settings});await configure();
 const service=createBloodmoonPackService({readState:readBloodmoonPackState,releaseEnabled:true,randomInt});
 const body=(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1});
 return {...f,settings,configure,service,body,state:()=>readBloodmoonPackState(f.env,{releaseEnabled:true})};
}
