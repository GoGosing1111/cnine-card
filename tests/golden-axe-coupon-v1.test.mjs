import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redeemOldAxeCoupon} from '../functions/_golden_axe_coupon.js';
test('retired old axe coupons cannot issue or reissue items, even with a prior claim',async()=>{
 const env=new Proxy({},{get(){throw Error('Retired coupon must not touch inventory');}}),deps={json:(v,s=200)=>Response.json(v,{status:s})};
 const result=await redeemOldAxeCoupon({env,coupon:{reward_type:'PINGDU_OLD_AXE'},deps});assert.equal(result.status,410);assert.equal((await result.json()).code,'EVENT_RETIRED');assert.equal(await redeemOldAxeCoupon({coupon:{reward_type:'COIN'}}),null);
});
test('neither coupon CMS contract accepts an old axe reward type',()=>{
 const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),start=source.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),end=source.indexOf('let verifiedRewardMessageV1276ReadyPromise');
 const spec=Function(source.slice(start,end)+';return couponRewardSpec')();assert.equal(spec('PINGDU_OLD_AXE'),null);assert.equal(spec('CHUSEOK_COIN').label,'추석 코인');
 const cms=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');assert(!cms.includes('<option value="PINGDU_OLD_AXE">'));
});
