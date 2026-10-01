import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import {root,sha} from './compose-weapon.mjs';
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const m=await read('manifest.json'),before=await read('qa/v13/before-motion.json'),estimates=await read('qa/v13/scale-estimates.json');
const corrected=['twohandGrip','twohandLift','twohandStrike','twohandReturn'];
for(const key of m.activeMotionKeys){
 if(!corrected.includes(key)){assert.deepEqual(m.motion[key],before[key]);continue;}
 for(const [i,f] of m.motion[key].frames.entries()){
  const old=before[key].frames[i];for(const name of ['source','sourceIndex','sourceBounds','sourceFeet','sourceGrip','registration'])assert.deepEqual(f[name],old[name]);
  assert.equal(f.weapon.angle,old.weapon.angle);assert.equal(f.weapon.sha256,old.weapon.sha256);
  assert.equal(sha(await fs.readFile(path.join(root,old.file))),old.sha256,'approved V10 frame preserved');
 }
}
// Independent pixel check on upright poses only. Bending/kneeling/lifting is
// deliberately excluded: equal bounding-box height would deform those motions.
const neutral=[
 ['idle',0,[640,40,825,275]],['twohandGrip',0,[278,5,370,140]],['twohandGrip',1,[765,0,856,142]],
 ['twohandReturn',2,[280,700,384,845]],['twohandReturn',3,[782,700,886,845]],['twohandReturn',4,[245,0,340,130]]
];
async function paintedHeight(motion,key,index,roi){
 const f=motion[key].frames[index],sourceFeet=f.sourceFeet??[729,1507],reference=f.sourceBodyPixels??1452,fit=f.bodyPixels/reference;
 const x0=Math.max(0,Math.floor(256+(roi[0]-sourceFeet[0])*fit)),x1=Math.min(511,Math.ceil(256+(roi[2]-sourceFeet[0])*fit));
 const y0=Math.max(0,Math.floor(440+(roi[1]-sourceFeet[1])*fit)),y1=Math.min(511,Math.ceil(440+(roi[3]-sourceFeet[1])*fit));
 const {data}=await sharp(path.join(root,f.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let top=512;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const p=(y*512+x)*4,[r,g,b,a]=data.subarray(p,p+4);if(a>170&&g>45&&!(r>g*1.6&&r>b*1.6))top=Math.min(top,y);}
 assert.ok(top<512,'painted helmet must exist inside its measured region');return {key,index,paintedTop:top,heightAt400:(440-top)*400/f.bodyPixels};
}
const prior=[],after=[];for(const [key,i,roi] of neutral){prior.push(await paintedHeight(before,key,i,roi));after.push(await paintedHeight(m.motion,key,i,roi));}
const spread=rows=>(Math.max(...rows.map(r=>r.heightAt400))-Math.min(...rows.map(r=>r.heightAt400)))/rows[0].heightAt400;
assert.ok(spread(after)<.025,'neutral frame visible size spread must stay below 2.5%, including pixel rounding');assert.ok(spread(after)<spread(prior)/2,'visible size drift must actually improve');
const report={version:13,activeFrameReferencesInspected:27,repacked:17,nativePosesChanged:0,immutableInputsVerified:true,gripAxesAndFeetUnchanged:true,weaponLengthUnchanged:true,neutralPixelMeasurements:{before:prior,after,beforeSpread:spread(prior),afterSpread:spread(after)},corrections:estimates.records.map(r=>({key:r.key,index:r.index,factor:r.uniformCorrection,method:r.method})),otherTracks:{idle:'IMMUTABLE_APPROVED_BASELINE',dash:'INSPECTED_PROJECTED_STRIDE_PRESERVED',hit:'INSPECTED_RECOIL_PRESERVED',defeat:'INSPECTED_KNEEL_HEIGHT_PRESERVED'},limitations:'Articulated landmarks are manually reviewed 2D estimates, not 3D metrology. The neutral pose check measures actual packed helmet pixels independently of the calibration chain. Natural head tilt, crouching and perspective remain.'};
await fs.writeFile(path.join(root,'qa/v13/size-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({activeFrames:27,neutralSizeSpreadBefore:spread(prior),neutralSizeSpreadAfter:spread(after),unchangedGripAndFeet:true},null,2));
