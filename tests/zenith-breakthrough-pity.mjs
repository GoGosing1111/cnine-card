import assert from 'node:assert/strict';
import { breakthroughPityRule, ZENITH_BREAKTHROUGH_PITY_THRESHOLD } from '../functions/_breakthrough_pity.js';

assert.equal(ZENITH_BREAKTHROUGH_PITY_THRESHOLD,7);
for(let level=0;level<10;level++){
  assert.deepEqual(breakthroughPityRule('ZENITH',level,{enabled:false,thresholds:[]}),{
    enabled:true,grade:'ZENITH',threshold:7
  });
}
assert.deepEqual(breakthroughPityRule('SSR',3,{enabled:true,thresholds:[5,5,5,9]}),{
  enabled:true,grade:'SSR',threshold:9
});
assert.deepEqual(breakthroughPityRule('FUR',3,{enabled:true,thresholds:Array(10).fill(5)}),{
  enabled:false,grade:'FUR',threshold:null
});

console.log('ZENITH breakthrough pity: 7 consecutive failures, then guaranteed success');
