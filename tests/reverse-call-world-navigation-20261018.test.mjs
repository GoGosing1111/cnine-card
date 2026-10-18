import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const fixture=`<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0}#frame{position:relative;height:100dvh}</style>
<script defer src="/js/soopketmon-v21-exact-shell-adapter.js" data-enabled="false"></script>
<script defer src="/js/adventure-lobby-v2107.js"></script>
<div id="frame"></div><script>
addEventListener('DOMContentLoaded',()=>{
  // Use the game's default visibility and navigation callbacks, not the
  // standalone page's override that previously concealed this regression.
  const lobby=SoopAdventureLobby.create();
  lobby.setAttribute('data-shared-navigation','');
  document.getElementById('frame').append(lobby);
});</script></html>`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.avif':'image/avif','.ico':'image/x-icon','.woff2':'font/woff2'};

test('world opens from the game sidebar and mobile menu with the real visibility gate',async()=>{
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  const server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname==='/navigation-fixture/'){
        res.setHeader('content-type','text/html');res.end(fixture);return;
      }
      const file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      const body=await readFile(file);
      res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const mobile of [false,true]){
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"ok":true,"features":{}}'});
        return route.continue();
      });
      await context.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/navigation-fixture/');
      const menu=page.locator('soop-adventure-lobby');
      if(mobile){
        await menu.locator('.mobile-dock [data-category="all"]').click();
        for(const id of ['avatar','alchemy','goldenAxe','chicken'])assert.equal(await menu.locator('#menu-results [data-route="'+id+'"]').count(),0,'closed feature remains hidden: '+id);
      }
      await menu.locator(mobile?'#menu-results [data-route="world"]':'.side-link[data-route="world"]').click({timeout:5000});
      await page.waitForURL(base+'/world/',{timeout:5000});
      await page.locator('#start-story').click();
      await page.waitForURL(base+'/world/#scene=rewrite');
      // The public reader also shares this navigation, with its own callback.
      if(mobile)await menu.locator('.mobile-dock [data-category="all"]').click();
      await menu.locator(mobile?'#menu-results [data-route="world"]':'.side-link[data-route="world"]').click();
      await page.waitForURL(base+'/world/');
      assert.equal(await page.locator('#cover').isVisible(),true);
      assert.deepEqual(errors,[]);
      await context.close();
    }
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
