// Actual index and navigation; authenticated writes use only the loopback fixture.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.FACTION_QA_ORIGIN||'http://127.0.0.1:8960',source=process.env.FACTION_LIVE_ORIGIN||base;
const out=process.env.FACTION_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'faction-captains-'));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'}),headless:true});
const checks=[],errors=[],check=(value,name)=>{assert.ok(value,name);checks.push(name);};
const api=async(user,route,body)=>{const response=await fetch(`${base}/api/${route}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-review-user':String(user)},body:body?JSON.stringify({...body,requestId:crypto.randomUUID()}):undefined});assert.equal(response.status,200);return response.json();};
async function open(userId,viewport,route=''){
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
  const {user}=await api(userId,'me');
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','faction-review-'+user.id);},user);
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const response=await fetch(base+url.pathname+url.search,{method:request.method(),body:request.method()==='GET'?undefined:request.postData(),headers:{'content-type':'application/json','x-review-user':String(userId)}});
    await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await page.goto(source+'/'+(route?'?screen='+route:''));return page;
}
async function formation(page){await page.locator('.fw-tabs [data-fw-tab="formation"]').click();await page.locator('.fw-squads').waitFor();}
async function fits(page,label){check(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+1),label+' no horizontal overflow');}
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    const label=String(viewport.width);await api(1,'preview/reset',{});
    const master=await open(1,viewport),lobby=master.locator('soop-adventure-lobby');await lobby.locator('.stage-character').waitFor();
    if(viewport.width>980)await lobby.locator('.sidebar [data-category="pvp"]').click();
    else {await lobby.locator('.mobile-dock [data-category="all"]').click();await lobby.locator('.category-jump[data-category="pvp"]').click();}
    await lobby.locator('.menu-result[data-route="clanWar"]').waitFor();
    check(await lobby.locator('.menu-result[data-route="clanFaction"]').isVisible(),label+' battle menu exposes both shortcuts');
    await master.screenshot({path:path.join(out,`menu-${label}.png`)});
    await lobby.locator('.menu-result[data-route="clanWar"]').click();await master.locator('[data-clan-fight]').waitFor();
    check(await master.locator('[data-clan-tab="war"]').first().evaluate(el=>el.classList.contains('active')),label+' clan war shortcut selects regular battle');
    await master.evaluate(()=>window.SoopketmonV21ExactShell.navigate('clanFaction'));
    await formation(master);check(await master.locator('[data-fw-captain]').count()===2,label+' master has two appointment slots');
    await master.locator('[data-fw-captain="attack1"]').selectOption('2');
    check(await master.locator('[data-fw-captain="attack2"] option[value="2"]').isDisabled(),label+' duplicate captain disabled');
    await master.locator('[data-fw-captain="attack2"]').selectOption('4');await master.locator('[data-fw-save]').click();
    await master.locator('.fw-notice').filter({hasText:'행동대장 지정을 저장'}).waitFor();
    assert.deepEqual((await api(1,'clan/faction/overview')).captains,{attack1:2,attack2:4});
    await fits(master,label+' master');await master.locator('.fw-formation').scrollIntoViewIfNeeded();
    await master.screenshot({path:path.join(out,`master-${label}.png`),fullPage:true});await master.close();

    const captain=await open(2,viewport,'clanFaction');await formation(captain);
    check(await captain.locator('[data-fw-captain]').count()===0,label+' captain cannot appoint roles');
    check(await captain.locator('.fw-squad-card.is-editable').count()===4,label+' captain edits both attack and defense squads');
    await captain.locator('[data-fw-remove="6"]').click();await captain.locator('#fw-assign-squad').selectOption('attack2');await captain.locator('[data-fw-add="6"]').click();
    await captain.locator('[data-fw-save]').click();await captain.locator('.fw-notice').filter({hasText:'부대 편성을 저장'}).waitFor();
    const changed=await api(2,'clan/faction/overview');check(changed.formation.attack2.includes(6)&&!changed.formation.defense1.includes(6),label+' captain persists defense-to-attack transfer');
    await fits(captain,label+' captain');await captain.locator('.fw-formation').scrollIntoViewIfNeeded();
    await captain.screenshot({path:path.join(out,`captain-${label}.png`),fullPage:true});
    if(viewport.width===1440){
      await captain.locator('[data-fw-remove="6"]').click();
      const concurrent={...changed.formation,defense2:[9,10]};
      await api(4,'clan/faction/formation',{formation:concurrent,baseFormation:changed.formation});
      await captain.locator('[data-fw-save]').click();await captain.locator('.fw-error').filter({hasText:'다른 편성자'}).waitFor();
      assert.deepEqual((await api(2,'clan/faction/overview')).formation,concurrent);check(true,'stale UI draft cannot overwrite newer lineup');
      await captain.locator('.fw-error [data-fw-reload]').click();await captain.locator('[data-fw-remove="6"]').waitFor();
      await api(1,'clan/faction/captains',{captains:{attack1:0,attack2:4}});
      await captain.locator('[data-fw-remove="1"]').click();await captain.locator('[data-fw-save]').click();
      await captain.locator('.fw-error').filter({hasText:'클랜장 또는 행동대장'}).waitFor();
      check(await captain.locator('[data-fw-save]').isDisabled()&&await captain.locator('[data-fw-remove]').count()===0,'revoked captain loses editing controls after rejected save');
    }
    await captain.close();

    const member=await open(3,viewport,'clanFaction');await formation(member);
    check(await member.locator('[data-fw-remove]').count()===0&&await member.locator('[data-fw-save]').isDisabled(),label+' ordinary member cannot edit lineup');
    await member.locator('[data-fw-tab="map"]').click();await member.locator('[data-fw-zone="11680"]').click();
    check(await member.locator('[data-fw-launch]').isEnabled(),label+' ordinary attack member can launch');
    await member.locator('[data-fw-launch]').click();await member.locator('[data-fw-room-strike]').waitFor();
    check(await member.locator('[data-fw-room-strike]').isEnabled(),label+' ordinary member enters own battle');
    await member.screenshot({path:path.join(out,`member-launch-${label}.png`)});await member.close();
    const coldWar=await open(1,viewport,'clanWar');await coldWar.locator('[data-clan-fight]').waitFor();await fits(coldWar,label+' cold regular shortcut');await coldWar.close();
  }
  await api(1,'preview/reset',{});await api(1,'clan/faction/captains',{captains:{attack1:2,attack2:4}});
  const narrow=await open(2,{width:320,height:740},'clanFaction');await formation(narrow);await fits(narrow,'320 captain');
  await narrow.locator('.fw-formation').scrollIntoViewIfNeeded();await narrow.screenshot({path:path.join(out,'captain-320.png'),fullPage:true});await narrow.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'captains-results.json'),JSON.stringify({source,checks,errors},null,2));console.log({checks,errors});
}finally{await browser.close();}
