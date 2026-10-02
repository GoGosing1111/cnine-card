import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {companionCmsFixture,reviewPet} from './helpers/companion-preparation-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=process.env.QA_OUTPUT_DIR;
if(!out||path.resolve(out).startsWith(path.resolve(root)))throw Error('Set QA_OUTPUT_DIR outside the deployment repository');
await mkdir(out,{recursive:true});const fixture=await companionCmsFixture(),errors=[];
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
    if(route.startsWith('/api/admin/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await fixture.handle(new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),{path:route.slice(5)});
      res.writeHead(response?.status||404,response?Object.fromEntries(response.headers):{});res.end(response?await response.text():'');return;
    }
    if(route==='/qa-admin'){
      res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end('<div id="nav"></div><div id="roleBadge">OWNER</div><h1 id="pageTitle"></h1><div id="cms"></div><script type="module" src="/admin/companion-admin-v2.mjs"></script>');return;
    }
    let pathname=decodeURIComponent(route);if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!/^\/(?:admin|shared|preview\/companion-preparation-v2|assets)\//.test(pathname)){res.writeHead(404);res.end();return;}
    const data=await readFile(file),ext=path.extname(file),mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.webp':'image/webp'}[ext]||'application/octet-stream';res.writeHead(200,{'content-type':mime});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
  for(const [label,viewport]of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/preview/companion-preparation-v2/');await page.locator('[data-status]').filter({hasText:/CMS 버전/}).waitFor();
    if(label==='desktop'){
      await page.locator('[data-add]').first().click();await page.locator('[data-field="name"]').fill('검수용 펫');await page.locator('[data-field="battleSprite"]').fill(reviewPet().battleSprite);await page.locator('[data-field="enabled"]').check();await page.locator('[data-buff-percent="0"]').fill('20');
      await page.locator('[data-add-buff]').click();await page.locator('[data-buff-type="1"]').selectOption('MAX_HP_PERCENT');await page.locator('[data-buff-percent="1"]').fill('10');await page.locator('[data-save]').click();await page.locator('[data-status]').filter({hasText:/저장 완료/}).waitFor();
    }
    await page.locator('[data-merc="0"]').selectOption('V-013');const blocked=page.locator('[data-merc="1"] option[value="V-022"]');assert.equal(await blocked.evaluate(option=>option.disabled),true,JSON.stringify({html:await blocked.evaluate(option=>option.outerHTML),errors}));assert.equal(await page.locator('[data-merc="1"] option[value="V-021"]').evaluate(option=>option.disabled),false);await page.locator('[data-merc="1"]').selectOption('V-021');
    await page.locator('[data-review-pet]').selectOption('PET-001');await page.locator('[data-run]').click();await page.locator('.cp-opening:not([hidden])').waitFor();
    assert.equal(await page.locator('.cp-opening img').evaluate(image=>image.complete&&image.naturalWidth>0),true);await page.screenshot({path:path.join(out,`${label}-opening.png`),fullPage:true});
    await page.locator('.cp-result-head').filter({hasText:'시작 버프 적용 완료'}).waitFor();assert.equal(await page.locator('.cp-result tbody tr').count(),7);assert.match(await page.locator('.cp-result>p').textContent(),/오메가-X \d+회 행동/);
    await page.locator('.cp-opening').waitFor({state:'hidden'});await page.screenshot({path:path.join(out,`${label}-configured.png`),fullPage:true});
    const geometry=await page.evaluate(()=>({page:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,missing:[...document.querySelectorAll('.cp-arena img')].filter(image=>!image.complete||!image.naturalWidth).length}));assert.equal(geometry.missing,0);assert.ok(geometry.scroll<=geometry.page+1,JSON.stringify(geometry));
    if(label==='desktop'){
      await page.locator('[data-pet-mode="PVE"]').uncheck();await page.locator('[data-pet-mode="PVP"]').uncheck();await page.locator('[data-save]').click();assert.match(await page.locator('[data-status]').textContent(),/모드/);await page.locator('[data-pet-mode="PVE"]').check();await page.locator('[data-pet-mode="PVP"]').check();
      fixture.fail(true);await page.locator('[data-save]').click();await page.locator('[data-save]').filter({hasText:'저장 결과 재확인'}).waitFor();assert.equal(await page.locator('[data-field="name"]').isDisabled(),true);fixture.fail(false);await page.locator('[data-save]').click();await page.locator('[data-status]').filter({hasText:/저장 완료/}).waitFor();
    }else{
      await page.locator('[data-add]').first().click();assert.equal(await page.locator('[data-remove-buff="0"]').isDisabled(),true);await page.locator('[data-delete]').click();assert.equal(await page.locator('[data-pet-list] option').count(),2);await page.locator('[data-save]').click();await page.locator('[data-status]').filter({hasText:/저장 완료/}).waitFor();
    }
    results.push({label,viewport,...geometry});await page.close();
  }
  const menu=await browser.newPage();menu.on('pageerror',error=>errors.push(error.message));await menu.goto(base+'/qa-admin');await menu.getByRole('button',{name:'펫·동료 준비'}).click();await menu.locator('[data-status]').filter({hasText:/CMS 버전/}).waitFor();await menu.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');assert.equal(await menu.locator('[data-view="companion-preparation"]').isHidden(),true);assert.equal(await menu.locator('#view-companion-preparation').isHidden(),true);await menu.close();
  assert.deepEqual(errors,[]);await writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,passed:true},null,2));console.log(JSON.stringify({results,errors,passed:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fixture.close();}
