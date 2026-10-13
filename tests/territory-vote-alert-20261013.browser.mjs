import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TERRITORY_VOTE_QA_URL;
assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'territory-vote-alert-'));
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
let activePage;
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    let votes=0,voted=false,ready=true,generation=0,lastState,voteCalls=0;
    const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
    const project=state=>{
      const s=structuredClone(state);if(!s.counter)return s;
      const own=s.counter.A.skills.INFILTRATION,enemy=s.counter.B.skills.ASSAULT;
      own.votes=s.front.id===5?votes:0;own.voted=voted;own.ready=ready;
      own.readyAt=ready?null:new Date(Date.now()+60000).toISOString();
      own.voteKey=`V25:${s.round.id}:${s.front.id}:A:INFILTRATION:${generation}`;
      enemy.votes=20;
      return s;
    };
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/api/territory-war/vote-operation'){
        const body=route.request().postDataJSON();assert.equal(body.operation,'INFILTRATION');voteCalls++;votes++;voted=true;
        return route.fulfill({json:{ok:true,result:{voted:true,votes},state:project(lastState)}});
      }
      if(['/api/territory-war/state','/api/territory-war/state-lite'].includes(url.pathname)){
        if(!url.searchParams.has('nodeIndex'))url.searchParams.set('nodeIndex','4');
        const response=await route.fetch({url:url.href});lastState=await response.json();return route.fulfill({response,json:project(lastState)});
      }
      return route.continue();
    });
    const page=await context.newPage(),errors=[];
    activePage=page;
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await page.goto(origin+'/');await page.locator('#qaTerritoryOpen').click();
    await page.locator('.tw4-shell').waitFor();
    const refresh=async()=>{
      await page.evaluate(()=>{clearApiCache();globalThis.qaPreviousTerritoryShell=document.querySelector('.tw4-shell');});
      // Mobile hides the refresh icon; dispatch its real state loader to simulate polling.
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname==='/api/territory-war/state',{timeout:10000}),
        page.locator('[data-tw3-refresh]').dispatchEvent('click')
      ]);
      await page.waitForFunction(()=>!qaPreviousTerritoryShell.isConnected&&!document.querySelector('#territoryWarModalV3.is-busy'));
    };
    assert.equal(await page.locator('.tw-vote-active').count(),0,'enemy votes alone must not alert');
    assert.equal(await page.locator('.tw-vote-notice').count(),0);
    votes=7;await refresh();await page.locator('.tw-vote-notice').waitFor({state:'visible'});
    assert.match(await page.locator('.tw-vote-notice').innerText(),/기습 침투/);
    assert.equal(await page.locator('[data-vote-count]').innerText(),'7/25');
    assert.ok((await page.locator('.tw-vote-notice').boundingBox()).height<=56,'notice stays one compact line');
    await page.evaluate(()=>globalThis.qaVoteNotice=document.querySelector('.tw-vote-notice'));
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(out,'notice-'+viewport.width+'.png'),fullPage:true});
    votes=9;await refresh();await page.waitForFunction(()=>document.querySelector('[data-vote-count]')?.textContent==='9/25');
    assert.equal(await page.evaluate(()=>qaVoteNotice===document.querySelector('.tw-vote-notice')),true,'polling must reuse, not restart, the notice');
    await page.locator('.tw-vote-open').click();
    await page.locator('.tw4-drawer-panel[data-tw4-panel="operations"]').waitFor({state:'visible'});
    assert.equal(await page.locator('.tw-vote-preference input').isChecked(),true);
    const card=page.locator('.tw5-skill-grid [data-tw3-operation="INFILTRATION"]');
    await card.scrollIntoViewIfNeeded();assert.ok((await card.getAttribute('class')).includes('tw-vote-active'));
    assert.equal(await card.isDisabled(),false);assert.equal(await card.getAttribute('data-tw-vote-label'),'9 / 25명 투표 중');
    await page.waitForTimeout(350);
    await page.screenshot({path:path.join(out,'skill-'+viewport.width+'.png'),fullPage:true});
    await card.click();await page.waitForFunction(()=>document.querySelector('.tw5-skill-grid [data-tw3-operation="INFILTRATION"]')?.getAttribute('aria-pressed')==='true');
    assert.equal(voteCalls,1);assert.equal(await card.isDisabled(),true);
    assert.ok((await card.getAttribute('class')).includes('tw-vote-active'),'own voted card keeps the active ballot border');
    await page.locator('.tw4-drawer header [data-tw4-drawer-close]').click();
    await page.locator('.tw4-drawer-layer').waitFor({state:'hidden'});
    await refresh();assert.equal(await page.locator('.tw-vote-notice').count(),0);
    ready=false;votes=0;await refresh();await page.waitForFunction(()=>document.querySelectorAll('.tw-vote-active').length===0);
    ready=true;voted=false;votes=3;generation=123;await refresh();await page.locator('.tw-vote-notice').waitFor({state:'visible'});
    await page.locator('.tw-vote-dismiss').click();await refresh();assert.equal(await page.locator('.tw-vote-notice').count(),0);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.tw4-action-dock [data-tw4-drawer="operations"]').evaluate(node=>getComputedStyle(node).animationName),'none');
    await page.locator('[data-tw4-node="0"]').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('.tw-vote-active').length===0);
    if(await page.locator('.tw4-shell.zone-open').count())await page.locator('[data-tw4-zone-close]').click();
    await page.locator('[data-tw4-node="4"]').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('.tw-vote-active').length>0);
    assert.equal(await page.locator('.tw-vote-notice').count(),0,'returning to the same ballot must not repeat the alarm');
    if(await page.locator('.tw4-shell.zone-open').count())await page.locator('[data-tw4-zone-close]').click();
    await page.locator('[data-tw3-close]').first().click();assert.equal(await page.locator('.tw-vote-notice').count(),0);
    await page.evaluate(()=>openTerritoryWar());await page.locator('.tw4-shell').waitFor();
    assert.equal(await page.locator('.tw-vote-notice').count(),0);
    await page.locator('.tw4-action-dock [data-tw4-drawer="operations"]').click();
    await page.locator('.tw-vote-preference input').uncheck();
    await page.locator('.tw-vote-preference').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,'preference-'+viewport.width+'.png'),fullPage:true});
    await page.locator('.tw4-drawer header [data-tw4-drawer-close]').click();
    await page.locator('.tw4-drawer-layer').waitFor({state:'hidden'});
    generation=456;votes=4;await refresh();
    assert.equal(await page.locator('.tw-vote-notice').count(),0,'OFF suppresses a newly started ballot');
    assert.ok(await page.locator('.tw-vote-active').count(),'OFF retains the active skill border');
    await page.reload();await page.locator('#qaTerritoryOpen').click();await page.locator('.tw4-shell').waitFor();
    assert.equal(await page.locator('.tw-vote-notice').count(),0);
    await page.locator('.tw4-action-dock [data-tw4-drawer="operations"]').click();
    assert.equal(await page.locator('.tw-vote-preference input').isChecked(),false,'OFF survives page reload');
    await page.locator('.tw-vote-preference input').check();
    assert.equal(await page.locator('.tw-vote-notice').count(),0,'panel defers the notification');
    await page.locator('.tw4-drawer header [data-tw4-drawer-close]').click();
    await page.locator('.tw4-drawer-layer').waitFor({state:'hidden'});
    await page.locator('.tw-vote-notice').waitFor({state:'visible'});
    await page.locator('.tw-vote-notice').waitFor({state:'detached',timeout:5500});
    await refresh();assert.equal(await page.locator('.tw-vote-notice').count(),0,'expired notification does not repeat');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    reports.push({width:viewport.width,allyOnly:true,activeCardAndMenu:true,countUpdates:true,noticeReused:true,ctaOpensSkills:true,voteCalls,ownVoteRemainsHighlighted:true,cooldownClears:true,newBallotNotifies:true,frontScoped:true,noRepeatOnReentry:true,reducedMotion:true,compactNotice:true,offKeepsBorder:true,offPersistsOnReload:true,onRestoresAlert:true,autoDismissFourSeconds:true,pageErrors:errors});
    await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error((await activePage.locator('body').innerText()).slice(-3500));}console.error('Artifacts:',out);throw error;}
finally{await browser.close();}
