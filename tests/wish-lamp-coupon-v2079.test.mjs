import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redeemWishTicketCoupon} from '../functions/_wish_lamp_coupon.js';
test('retired coupons, including retries of previously redeemed tickets, never issue old items',async()=>{
 const deps={json:(v,s=200)=>Response.json(v,{status:s})};
 const result=await redeemWishTicketCoupon({coupon:{reward_type:'PINGDU_WISH_TICKET'},deps});assert.equal(result.status,410);assert.equal((await result.json()).code,'WISH_LAMP_RETIRED');
 assert.equal(await redeemWishTicketCoupon({coupon:{reward_type:'COIN'}}),null);
});
test('CMS cannot create another wish ticket coupon',()=>{
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),specs=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
 const spec=Function(specs+';return couponRewardSpec')();assert.equal(spec('PINGDU_WISH_TICKET'),null);assert.equal(spec('PINGDU_OLD_AXE'),null);assert.equal(spec('CHUSEOK_COIN').label,'추석 코인');
});
