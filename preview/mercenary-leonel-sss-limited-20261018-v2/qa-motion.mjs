import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {MODES,sample,PLAYBACK_RATES} from './motion.mjs';
const results=[];
for(const mode of ['attack','skill','ultimate']){
 const intro=MODES[mode].intro,a=sample(mode,intro+.1),b=sample(mode,intro+.15);
 assert(Math.abs((b.bodyTime-a.bodyTime)-.1)<1e-9);
 assert.equal(a.effectPlaybackRate,1);assert.equal(a.motionPlaybackRate,2);
 results.push({mode,bodySecondsPerWallSecond:2,authoredBodyDuration:MODES[mode].authoredDuration,actualBodyDuration:MODES[mode].authoredDuration/2,intro});
}
const prior=await fs.readFile(new URL('../mercenary-leonel-sss-limited-20261018-v1/motion.mjs',import.meta.url),'utf8');
const current=await fs.readFile(new URL('motion.mjs',import.meta.url),'utf8');
const calls=s=>[...s.matchAll(/fx\('([^']+)',([\d.]+),([\d.]+)/g)];
const old=calls(prior),next=calls(current).filter(m=>m[1]!=='pressure');assert.equal(old.length,next.length);
const fx=old.map((m,i)=>{const duration=Number(m[3])-Number(m[2]),now=Number(next[i][3]);assert.equal(next[i][1],m[1]);assert(Math.abs(duration-now)<1e-9);return{key:m[1],priorDuration:duration,currentDuration:now,rate:1};});
for(const mode of ['idle','dash'])assert.equal(MODES[mode].rate,1);
const report={status:'PASS',rates:PLAYBACK_RATES,body:results,unchangedFxDurations:fx};
await fs.writeFile(new URL('qa/motion-rates.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log('Body time 2x verified; all existing FX durations unchanged against V1.');
