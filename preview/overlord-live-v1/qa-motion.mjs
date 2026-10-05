import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(pathToFileURL(process.cwd()+'/package.json')),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=process.cwd()+'/preview/overlord-live-v1/qa/motion/';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{
 for(const[name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:8996/preview/overlord-live-v1/');
  await page.waitForFunction(()=>window.OverlordLiveReview,null,{timeout:60000});
  const normal=[];let combo;
  for(const[mode,duration,contact]of [['attack',1.5,.41],['combo',2.85,1.05],['skill',4.9,3.32]]){
   const expected=await page.evaluate(mode=>window.OverlordLiveReview.normal(mode),mode);
   const timing=await page.evaluate(({contact})=>{
    const r=window.OverlordLiveReview,s=r.engine.accountBattleUnit.swordAnimation;r.pause(true);s.timeline.pause();
    const duration=s.timeline.duration(),speed=s.diagnostics().motionSpeed;s.timeline.time(contact/speed,false);
    return{duration,speed,authoredTimeMs:s.timeMs,rate:s.timeline.timeScale()};
   },{contact});
   assert.ok(Math.abs(timing.duration-duration/3.5)<1e-6);
   const paused=await page.evaluate(()=>window.OverlordLiveReview.engine.accountBattleUnit.swordAnimation.timeMs);
   await page.waitForTimeout(120);
   assert.equal(await page.evaluate(()=>window.OverlordLiveReview.engine.accountBattleUnit.swordAnimation.timeMs),paused);
   if(mode==='combo'){
    combo=await page.evaluate(contact=>{
     const fx=window.OverlordLiveReview.engine.accountBattleUnit.swordAnimation.fx;
     const snapshot=()=>({effects:fx.state.effects.map((e,i)=>({key:e.key,x:fx.pool[i].x,y:fx.pool[i].y,width:fx.pool[i].width,height:fx.pool[i].height})),body:[fx.unit.bodySprite.scale.x,fx.unit.bodySprite.scale.y],title:[fx.title.view.scale.x,fx.title.view.scale.y]});
     Object.getPrototypeOf(Object.getPrototypeOf(fx)).render.call(fx,contact);const base=snapshot();
     fx.render(contact);const enlarged=snapshot();fx.render(contact);return{base,enlarged,repeated:snapshot()};
    },contact);
    assert.deepEqual(combo.enlarged.body,combo.base.body);assert.deepEqual(combo.enlarged.title,combo.base.title);assert.deepEqual(combo.repeated,combo.enlarged);
    combo.base.effects.forEach((e,i)=>{
     const after=combo.enlarged.effects[i],scale=['slash','impact'].includes(e.key)?1.3:1;
     assert.ok(Math.abs(after.width/e.width-scale)<1e-6);assert.ok(Math.abs(after.height/e.height-scale)<1e-6);
     assert.ok(Math.abs(after.x-e.x)<1e-6);assert.ok(Math.abs(after.y-e.y)<1e-6);
    });
    await page.screenshot({path:dir+name+'-combo.png'});
   }
   await page.evaluate(async()=>{const r=window.OverlordLiveReview;r.pause(false);r.engine.accountBattleUnit.swordAnimation.timeline.play();await r.done;});
   const actual=await page.evaluate(()=>window.OverlordLiveReview.diagnostics());assert.equal(actual.normalDamage,expected);
   normal.push({mode,timing,expectedDamage:expected,actualDamage:actual.normalDamage});
  }
  const areas=[];
  for(const kind of ['single','multi']){
   const result=await page.evaluate(async kind=>{
    const r=window.OverlordLiveReview;await r.reset(kind);const started=performance.now();await r.skill();await r.done;
    const result=r.diagnostics();return{elapsedMs:performance.now()-started,...result};
   },kind);
   assert.equal(result.skillHits,result.expectedHits);assert.equal(result.skillDamage,result.expectedDamage);assert.equal(result.error,null);areas.push({kind,...result});
  }
  const appearance=await page.evaluate(()=>{const u=window.OverlordLiveReview.engine.accountBattleUnit;return{nicknameVisible:u.nameHud.visible,gunVisible:u.weaponSprite.visible,title:u.swordAnimation.diagnostics().title};});
  assert.equal(appearance.nicknameVisible,false);assert.equal(appearance.gunVisible,false);assert.equal(appearance.title.enabled,true);assert.deepEqual(errors,[]);
  report.push({name,normal,combo,areas,appearance,errors});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(dir+'report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.map(r=>({name:r.name,normal:r.normal,comboEffects:r.combo.enlarged.effects.map((e,i)=>({key:e.key,scale:e.width/r.combo.base.effects[i].width})),areas:r.areas.map(a=>({kind:a.kind,elapsedMs:a.elapsedMs,hits:a.skillHits,damage:a.skillDamage})),errors:r.errors}))));
