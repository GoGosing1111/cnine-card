import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redeemChuseokCoinCoupon} from '../functions/_chuseok_coupon.js';
test('Chuseok coupon redemption returns 410 without touching inventory or ordinary coupons',async()=>{
 const deps={json:(v,s=200)=>Response.json(v,{status:s})},env={get DB(){throw Error('Retired coupon must not access DB');}};
 const r=await redeemChuseokCoinCoupon({env,coupon:{reward_type:'CHUSEOK_COIN'},deps});assert.equal(r.status,410);assert.equal((await r.json()).code,'EVENT_RETIRED');assert.equal(await redeemChuseokCoinCoupon({env,coupon:{reward_type:'COIN'},deps}),null);
});
test('coupon creation rejects Chuseok and supports the reopened axe',()=>{
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');const code=api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise'));
 const spec=Function(code+';return couponRewardSpec')();assert.equal(spec('CHUSEOK_COIN'),null);assert.equal(spec('PINGDU_OLD_AXE').label,'낡은도끼');
});
