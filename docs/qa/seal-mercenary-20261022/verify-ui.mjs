import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const out=path.dirname(fileURLToPath(import.meta.url));
const base=process.env.SEAL_QA_BASE||'http://127.0.0.1:8916';
const live=base.startsWith('https:');
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),evidence=[];
try{
 for(const width of (live?[390]:[1440,390])){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390});
  const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});
  await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await page.goto(base+'/preview/seal-battle-rework-20261021/?review=seal-mercenary-20261022-v1');
  await page.locator('#sealRoleDetail').waitFor();
  assert.match(await page.locator('.seal-personal-facts').innerText(),/헬리오스.*Lv\.1/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,`${live?'live-':''}${width}-preparation.png`),fullPage:true});
  await page.evaluate(async()=>{
   await ensureFeatureResources();window.sealQA={attacks:0,seen:[],engine:null};
   const api=ProjectVPixiBattle,mount=api.mountForBattle;
   api.mountForBattle=async(...args)=>{
    const e=await mount(...args);sealQA.engine=e;
    const normal=e.normalAttack;
    e.normalAttack=async function(index,options){
     if(options?.attacker?.isMercenary){const a=options.attacker,b=a.root.getBounds();sealQA.attacks++;sealQA.seen.push({id:a.id,cardId:a.cardId,visible:a.root.visible,hp:a.hp,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},native:true});}
     return normal.call(this,index,options);
    };return e;
   };
  });
  for(const scenario of (live?['boss']:['active','boss','no-mercenary'])){
   await page.selectOption('#scenario',scenario);await page.locator('[data-seal-role]').first().waitFor();
   if(scenario==='boss'){await page.locator('[data-seal-role="BOSS"]').waitFor();await page.locator('#modal.seal-dialog [data-seal-confirm]').click();}
   if(scenario==='no-mercenary')assert.match(await page.locator('.seal-personal-facts').innerText(),/PvE 용병\s+미편성/);
   const before=await page.evaluate(()=>sealQA.attacks);
   await page.locator('[data-seal-role]').first().click();await page.locator('[data-seal-confirm]').click();
   await page.locator('.is-v3-ready canvas').waitFor({timeout:60000});
   if(scenario!=='no-mercenary'){
    await page.waitForFunction(n=>sealQA.attacks>n,before,{timeout:60000});
    await page.screenshot({path:path.join(out,`${live?'live-':''}${width}-${scenario}-attack.png`)});
   }
   await page.locator('.seal-battle-return').waitFor({timeout:60000});
   const result=await page.evaluate(()=>({attacks:sealQA.attacks,seen:sealQA.seen,mercenaries:sealQA.engine.mercenaries.map(a=>({id:a.id,cardId:a.cardId,visible:a.root.visible})),cards:sealQA.engine.characters.filter(a=>a.team==='ALLY'&&!a.isMercenary).length}));
   assert.equal(result.mercenaries.length,scenario==='no-mercenary'?0:1);
   assert.equal(result.attacks-before,scenario==='no-mercenary'?0:1);
   if(scenario!=='no-mercenary'){assert.equal(result.seen.at(-1).cardId,'V-999');assert(result.seen.at(-1).visible);assert(result.seen.at(-1).bounds.width>0);}
   evidence.push({width,scenario,...result});
   await page.locator('.seal-battle-return').click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await page.close();
 }
 fs.writeFileSync(path.join(out,live?'live-browser.json':'browser.json'),JSON.stringify({at:new Date().toISOString(),base,evidence,liveAccountWrites:0,visualApproval:'USER_REVIEW_PENDING'},null,2)+'\n');
 console.log(JSON.stringify(evidence.map(({width,scenario,attacks,mercenaries})=>({width,scenario,attacks,mercenaries}))));
}finally{await browser.close();}
