import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),out=path.join(root,'preview/arden-energy-secret-blueprints-v1/qa');
await mkdir(out,{recursive:true});
const names=['아르덴 에너지','비밀무기 설계도 1장','비밀무기 설계도 2장','비밀무기 설계도 3장'];
const stems=['arden-energy-v1','secret-weapon-blueprint-chapter-1-v1','secret-weapon-blueprint-chapter-2-v1','secret-weapon-blueprint-chapter-3-v1'];
const assets=[];
for(const [i,stem] of stems.entries()){
  const files={};
  for(const ext of ['png','webp']){
    const relative='assets/items/'+stem+'.'+ext,bytes=await readFile(path.join(root,relative));
    const meta=await sharp(bytes).metadata(),raw=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(meta.width,meta.height);assert.equal(meta.hasAlpha,true);
    assert.ok(ext==='png'?meta.width>=1024:meta.width===512);
    let transparent=0,visible=0,edgeVisible=0,minX=meta.width,minY=meta.height,maxX=-1,maxY=-1;
    for(let y=0;y<meta.height;y++)for(let x=0;x<meta.width;x++){
      const alpha=raw.data[(y*meta.width+x)*4+3];
      if(alpha===0)transparent++;
      if(alpha>8){visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x===0||y===0||x===meta.width-1||y===meta.height-1)edgeVisible++;}
    }
    assert.ok(transparent>meta.width*meta.height*.1,relative+' lacks clear alpha');
    assert.equal(edgeVisible,0,relative+' touches canvas edge');
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(i===0&&ext==='png')assert.equal(sha256,'406e959495ada5973f751ab73b2117cb829984799dbaf595df69beec30608af4');
    files[ext]={path:relative,width:meta.width,height:meta.height,bytes:bytes.length,sha256,hasAlpha:true,transparentPixels:transparent,visiblePixels:visible,visibleBounds:{minX,minY,maxX,maxY},edgeVisible};
  }
  assets.push({name:names[i],...files});
}
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(!(await stat(file)).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const playwrightPath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(playwrightPath?pathToFileURL(playwrightPath).href:'playwright');
let browser;
const errors=[],checks=[];
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
    await page.goto(origin+'/preview/arden-energy-secret-blueprints-v1/index.html',{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('[data-item]').count(),4);
    assert.equal(await page.locator('img[src]').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,width+'-dark.png'),fullPage:true});
    for(let i=0;i<4;i++){
      await page.locator('[data-item="'+i+'"]').click();
      await page.locator('#detail[open]').waitFor();
      assert.equal(await page.locator('#detail-title').textContent(),names[i]);
      await page.locator('#detail-image').evaluate(image=>image.decode());
      if(i===3)await page.screenshot({path:path.join(out,width+'-detail.png')});
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-bg="light"]').click();
    assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('light')),true);
    if(width===1440)await page.locator('#blueprints').screenshot({path:path.join(out,'blueprints-light.png')});
    checks.push({width,allFourLoaded:true,overflow:false,allFourDialogs:true,lightBackground:true,thumbnailSizes:[64,128]});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  const report={checkedAt:new Date().toISOString(),tool:'Playwright + Sharp',assets,browser:checks,errors};
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
