import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SHOWCASE_MODES,SHOWCASE_DURATION} from './showcase.mjs';
const root=new URL('./',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
const write=(file,value)=>fs.writeFile(new URL(file,root),JSON.stringify(value,null,2)+'\n');
const manifest=await read('manifest.json'),qa=await read('qa-report.json'),browser=await read('qa/browser-report.json');
const playback={};
for(const file of ['qa/all-skills-fx-v11.webp','qa/overhead-fx-v11.webp']){
 const bytes=await fs.readFile(new URL(file,root)),meta=await sharp(bytes,{animated:true}).metadata();
 playback[file]={sha256:createHash('sha256').update(bytes).digest('hex').toUpperCase(),width:meta.width,pageHeight:meta.pageHeight,frames:meta.pages,bytes:bytes.length};
}
manifest.version=11;
manifest.effectVersion='V11_CHARGED_BLADE_SWEEP_IMPACT_WAKE';
manifest.effectEnhancement={
 date:'2026-10-01',status:'USER_REVIEW_PENDING',newNativeArtworkFrames:0,reusedNativeEffectFrames:96,characterArtworkChanged:false,weaponArtworkChanged:false,
 implementation:['skill.mjs','source/KnightFX.js','source/preview.js','showcase.mjs'],
 layers:['Original 96-frame native aura / dash / slash / charge / execution / guard / ultimate atlases','Blade-bound crimson glow and gold core; original registered grip/tip endpoints','Ten deterministic past-pose samples for blade light trails, not new poses','Contact-synchronous ground rings, incandescent particles, dust and residual light'],
 overhead:{charge:[.56,2.17],slash:[1.70,2.63],contact:1.98,execution:[1.80,3.28]},
 clockOwner:'CURRENT_V3_GSAP_TIMELINE',independentTicker:false,maximumPooledSprites:128,
 sourcePolicy:'Reuse existing native effect atlas frames unchanged; auxiliary light and particles are Pixi display layers, not regenerated character or sword art.'
};
manifest.showcase={modes:SHOWCASE_MODES,duration:SHOWCASE_DURATION,query:'?showcase=1#battle',auraEnabled:true,motionOnly:false,advance:'CURRENT_TIMELINE_ON_COMPLETE',completion:'STOP_ON_APPROVED_IDLE',runtimeEnabled:false};
manifest.reviewPlayback.allSkills='qa/all-skills-fx-v11.webp';
manifest.reviewPlayback.actualV3='qa/all-skills-fx-v11.webp';
manifest.reviewPlayback.twoHandActualV3='qa/overhead-fx-v11.webp';
qa.status='V11_EFFECT_TECH_QA_COMPLETE_USER_VISUAL_REVIEW_PENDING';qa.unitTests.passed=9;
qa.effectEnhancement=manifest.effectEnhancement;qa.playback=playback;
qa.browser=browser.map(r=>({viewport:r.name,pageErrors:r.errors.length,failedAssets:r.failed.length,horizontalOverflow:r.overflow.scroll>r.overflow.client,interruptCleared:r.interruption.cancelled&&r.interruption.visibleSprites===0,targetLossCleared:r.targetLost.cancelled&&r.targetLost.visibleSprites===0,speedPausePassed:r.speeds.every(s=>s.pauseStable),fullShowcaseCompleted:r.showcaseDone.showcase.completed,showcaseModes:r.showcaseDone.showcase.total,showcaseTimelinesAfterCompletion:r.showcaseDone.registeredTimelines,showcaseSpritesAfterCompletion:r.showcaseDone.visibleSprites,dispose:r.disposed}));
qa.visualInspection=['V11 actual V3 desktop/mobile: overhead charge 1.62s, sweep 1.84s, contact 1.98s, residual 2.50s and return 3.16s','All seven showcase clips, actual V3 FX on and native aura on','Existing approved body/sword masters and native frame hashes verified unchanged'];
await write('manifest.json',manifest);await write('qa-report.json',qa);
console.log(JSON.stringify({version:manifest.version,showcase:manifest.showcase,playback,browser:qa.browser},null,2));
