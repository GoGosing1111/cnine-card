// Real auction UI + API handler, isolated SQLite accounts, instrumented audio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {auctionFixture} from './helpers/auction-fixture-20260926.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = path.resolve(import.meta.dirname, '..'), out = path.resolve(root, '../qa-auction-bgm-bids');
fs.mkdirSync(out, {recursive: true});
const cleanup = [], f = await auctionFixture({after: fn => cleanup.push(fn)});
let legacyEvent = null;
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/auction-house-v1553.css"><link rel="stylesheet" href="/css/soopketmon-v21-auction-hunt-responsive.css">
<style>body{margin:0;background:#030810;font-family:Arial,sans-serif}button,input{font:inherit}</style><body><div id="app"></div>
<script>
window.account={serverUserId:1,coin:1000000000000};window.loadUser=()=>account;window.saveUser=u=>{window.account=u};
window.apiRequest=async(p,options={})=>{const response=await fetch('/api/'+p,options),data=await response.json();if(!response.ok)throw Error(data.error);return data;};
window.audioCalls=[];window.Audio=class extends EventTarget{
 constructor(){super();this.src='';this.currentTime=0;this.duration=40;this.readyState=1;this.paused=true;window.lastAudio=this;}
 setAttribute(k,v){if(k==='src')this.src=v;}getAttribute(k){return k==='src'?this.src:null;}removeAttribute(k){if(k==='src')this.src='';}
 play(){this.paused=false;audioCalls.push({type:'play',src:this.src});return Promise.resolve();}
 pause(){this.paused=true;audioCalls.push({type:'pause',src:this.src});}load(){}
};
</script><script src="/js/auction-house-v1553.js"></script><script>app.innerHTML=auctionHouseView();bindAuctionHouseView();</script></body></html>`;
const types = {'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/qa') {res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
    if (url.pathname.startsWith('/api/')) {
      let body='';for await (const chunk of req) body += chunk;
      const result=await f.request(url.pathname.slice(5)+url.search,body?JSON.parse(body):undefined);
      let payload, status;
      if(result instanceof Response){payload=await result.json();status=result.status;}else{payload=result.body;status=result.status;}
      if(url.pathname==='/api/auction/events'&&legacyEvent){payload.events.push(legacyEvent);legacyEvent=null;}
      res.writeHead(status,{'content-type':'application/json'});return res.end(JSON.stringify(payload));
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();
    res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  } catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}), report=[];
try {
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
    await page.locator('#auctionBidV1553').waitFor();
    const before=f.row('SELECT COALESCE(SUM(total_bid),0) total FROM auction_bidders_v1553').total;
    async function bid(amount,message){
      await page.locator('#auctionBidAmountV1553').fill(String(amount));
      await page.locator('#auctionBidMessageV1556').fill(message);
      const done=page.waitForResponse(r=>r.url().endsWith('/api/auction/schedule-event'));
      await page.locator('#auctionBidV1553').click();await done;
      await page.waitForFunction(expected=>document.querySelector('.auction-my-v1553 b').textContent.replace(/[^0-9]/g,'')===String(expected),f.row('SELECT total_bid FROM auction_bidders_v1553').total_bid);
    }
    await bid(500,'표시되면 안 되는 일반 입찰');
    assert.equal(await page.locator('.auction-bid-fly-v1556').count(),0);
    for(const amount of [10_000_000_000,100_000_000_000]){
      await page.locator('#auctionBidAmountV1553').fill('');
      await page.locator('[data-auction-add="'+amount+'"]').click();
      assert.equal(await page.locator('#auctionBidAmountV1553').inputValue(),String(amount));
      await bid(amount,'대형 일반 입찰');
      assert.equal(await page.locator('.auction-bid-fly-v1556').count(),0);
    }
    assert.equal(f.row('SELECT total_bid FROM auction_bidders_v1553').total_bid,before+110_000_000_500);
    await page.screenshot({path:path.join(out,'ranking-'+width+'.png'),fullPage:true});
    // Old clients may still deliver a silent event: the new UI must ignore it.
    await bid(1000,'BGM 발동 입찰');
    await page.locator('.auction-bid-fly-v1556').waitFor();
    const audioBefore=await page.evaluate(()=>({calls:audioCalls.length,src:lastAudio.src,paused:lastAudio.paused}));
    assert.equal(audioBefore.paused,false);
    legacyEvent={id:999999,amount:500,nickname:'일반 입찰',message:'구버전 일반 메시지',bgm_url:null,presentation_ends_at:new Date(Date.now()+60000).toISOString()};
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('.auction-bid-fly-v1556').count(),1);
    assert.match(await page.locator('.auction-bid-fly-v1556').innerText(),/BGM 발동 입찰/);
    assert.deepEqual(await page.evaluate(()=>({calls:audioCalls.length,src:lastAudio.src,paused:lastAudio.paused})),audioBefore);
    await bid(500,'음악 중 일반 입찰');
    assert.equal(await page.locator('.auction-bid-fly-v1556').count(),0);
    assert.deepEqual(await page.evaluate(()=>({calls:audioCalls.length,src:lastAudio.src,paused:lastAudio.paused})),audioBefore);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    report.push({width,ordinaryPopup:false,largeBids:[10000000000,100000000000],matchingBgmPopup:true,legacyPopup:false,audioUnchanged:true,overflow:false,pageErrors:errors});
    // End the test BGM and avoid its schedule carrying into the next viewport.
    await page.evaluate(()=>{lastAudio.dispatchEvent(new Event('ended'));stopAuctionHouseView();});
    f.sql.exec('DELETE FROM auction_bid_schedule_v1567');await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));for(const close of cleanup)await close();}
