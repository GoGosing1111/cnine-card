import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),out='docs/qa/seal-orbs-20261022';
try{
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
    for(const role of ['ATTACK','GUARD','PURIFY']){
      await page.goto('http://127.0.0.1:8916/preview/seal-battle-rework-20261021/');
      await page.evaluate(async role=>{
        await ensureFeatureResources('battleV2');
        const modal=document.getElementById('modal');modal.className='modal show battle-modal seal-combat-modal';
        const data=ProjectVBattleV3Live.sealPayload({roleKey:role,data:{cards:previewState().deck.cards,result:'WIN',playerPower:26000000,bossPower:5500000}});
        ProjectVBattleV3Live.prepareLoading({modal,mode:'SEAL',playerName:'봉인 원정대',opponentName:data.monster.name});
        window.orbIdleRenderer=await ProjectVBattleV3Live.createRenderer({modal,data,mode:'SEAL',playUltimateCinematics:false});
        await ProjectVPixiBattle.playEvents([{type:'DEPLOY'}]);
      },role);
      await page.locator('.is-v3-ready canvas').waitFor({timeout:60000});
      await page.screenshot({path:`${out}/${name}-${role.toLowerCase()}-idle.png`});
    }
    await page.close();
  }
  await fs.writeFile(out+'/idle-capture.json',JSON.stringify({source:'actual createRenderer + sealPayload + DEPLOY; before attack effects; full battles separately verified',viewports:[1440,390],roles:['ATTACK','GUARD','PURIFY']},null,2));
}finally{await browser.close();}
