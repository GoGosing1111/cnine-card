import {limitedFixture} from './limited-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft} from '../../shared/mercenary-halloween-pack-v1.mjs';
import {readHalloweenPackState} from '../../functions/_mercenary_halloween_pack.js';
import {createHalloweenPackService} from '../../functions/_mercenary_halloween_opening.js';
export async function halloweenFixture(t,{randomInt=()=>0}={}){
 const f=await limitedFixture(t);await f.configure({enabled:false});
 const settings=halloweenPackDraft();settings.mode='ON';settings.prices={single:100,ten:900};settings.normalRankRatesPpm=Object.fromEntries(Object.keys(settings.normalRankRatesPpm).map(rank=>[rank,rank==='SSS'?1000000:0]));settings.cardRatesPpm=Object.fromEntries(Object.keys(settings.cardRatesPpm).map(code=>[code,code==='V-980'?1000000:0]));settings.missRatePpm=0;settings.normalSssRatePpm=0;
 for(const code of Object.keys(settings.stockLimits))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,5)',code).run();
 const configure=async(revision=1)=>f.setting(HALLOWEEN_PACK_KEY,{revision,settings});await configure();
 const service=createHalloweenPackService({readState:readHalloweenPackState,releaseEnabled:true,randomInt});
 const body=(count=1)=>({requestId:crypto.randomUUID(),count,expectedRevision:1});
 return {...f,settings,configure,service,body,state:()=>readHalloweenPackState(f.env,{releaseEnabled:true})};
}
