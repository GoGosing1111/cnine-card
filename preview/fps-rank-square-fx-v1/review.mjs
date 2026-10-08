import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.dirname(fileURLToPath(import.meta.url));
const deps=process.env.RANK_FX_NODE_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const require=createRequire(path.join(deps,'rank-fx-tools.cjs'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||relative.split(/[\\/]/).some(s=>s.startsWith('.'))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(400);res.end();}
});
await new Promise(resolve=>server.listen(process.argv.includes('--serve')?8873:0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
if(process.argv.includes('--serve')){
  console.log(`Rank animation preview: ${url}`);
  process.on('SIGINT',()=>server.close());
}else{
  const {chromium}=require('playwright');
  const sharp=require('sharp');
  sharp.cache(false);sharp.concurrency(2);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  const page=await browser.newPage({viewport:{width:1440,height:1020},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(url);await page.waitForFunction(()=>window.rankPreview?.ready);
    const probe=await page.evaluate(()=>{
      rankPreview.render(0,false);
      const all=rankPreview.getCanvases();
      const baseline=all.chart.getContext('2d').getImageData(0,0,1536,1024).data;
      const original=all.icons.map(c=>c.getContext('2d').getImageData(0,0,256,256).data);
      const energy=Array(6).fill(0);
      for(const t of [0,.63,1.8,2.73,4.17,5.31]){
        rankPreview.render(t);
        all.icons.forEach((c,index)=>{
          const a=c.getContext('2d').getImageData(0,0,256,256).data;
          for(let p=0;p<a.length;p+=4)energy[index]+=Math.abs(a[p]-original[index][p])+Math.abs(a[p+1]-original[index][p+1])+Math.abs(a[p+2]-original[index][p+2]);
        });
      }
      rankPreview.render(.63);
      const frame=all.chart.getContext('2d').getImageData(0,0,1536,1024).data;
      let changesOutsideRankTiles=0;
      for(let y=0;y<1024;y++)for(let x=0;x<1536;x++){
        if(rankPreview.ranks.some(r=>x>=r.rect[0]&&x<r.rect[0]+r.rect[2]&&y>=r.rect[1]&&y<r.rect[1]+r.rect[3]))continue;
        const o=(y*1536+x)*4;
        if(frame[o]!==baseline[o]||frame[o+1]!==baseline[o+1]||frame[o+2]!==baseline[o+2])changesOutsideRankTiles++;
      }
      rankPreview.render(0);const start=all.chart.getContext('2d').getImageData(0,0,1536,1024).data;rankPreview.render(6);const end=all.chart.getContext('2d').getImageData(0,0,1536,1024).data;
      let loopPixelChanges=0,maxLoopChannelDelta=0;
      for(let i=0;i<start.length;i++)if(start[i]!==end[i]){loopPixelChanges++;maxLoopChannelDelta=Math.max(maxLoopChannelDelta,Math.abs(start[i]-end[i]));}
      return {rankNames:rankPreview.ranks.map(r=>r.name),energy:energy.map(n=>Math.round(n/6)),seamlessLoop:loopPixelChanges===0,loopPixelChanges,maxLoopChannelDelta,changesOutsideRankTiles};
    });
    console.log('Renderer checks:',JSON.stringify(probe));
    assert.equal(probe.rankNames.length,6);assert.equal(probe.rankNames[0],'대령');assert.equal(probe.rankNames[5],'원수');assert.equal(probe.seamlessLoop,true);assert.equal(probe.changesOutsideRankTiles,0);assert(probe.energy.every(n=>n>10000));
    await page.evaluate(()=>rankPreview.render(2.1));
    await page.screenshot({path:path.join(root,'qa/desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>rankPreview.render(2.1));
    const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,icons:[...document.querySelectorAll('.rank canvas')].map(c=>({w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height}))}));
    assert(mobile.scrollWidth<=mobile.width);assert(mobile.icons.every(c=>c.w>=140&&Math.abs(c.w-c.h)<1));
    await page.screenshot({path:path.join(root,'qa/mobile.png'),fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.getElementById('pause').textContent==='재생');await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#effects').click();assert.equal(await page.locator('#effects').getAttribute('aria-pressed'),'false');await page.locator('#effects').click();
    await page.setViewportSize({width:1440,height:1020});
    const frames=100,width=1020,height=690;
    const stack=Buffer.alloc(width*height*4*frames);
    const iconStacks=Array.from({length:6},()=>Buffer.alloc(256*256*4*frames));
    for(let i=0;i<frames;i++){
      const pngs=await page.evaluate(t=>{rankPreview.render(t);const c=rankPreview.getCanvases();return [c.comparison,...c.icons].map(v=>v.toDataURL('image/png').split(',')[1]);},i*.06);
      const raw=await Promise.all(pngs.map(p=>sharp(Buffer.from(p,'base64')).ensureAlpha().raw().toBuffer()));
      raw[0].copy(stack,i*width*height*4);
      raw.slice(1).forEach((b,k)=>b.copy(iconStacks[k],i*256*256*4));
      if(i%20===0)console.log(`Captured ${i+1}/${frames} animation frames`);
    }
    console.log('Encoding repeating GIF and six animated WebP icons');
    const gif=path.join(root,'exports/rank-effects-six.gif');
    await sharp(stack,{raw:{width,height:height*frames,channels:4,pageHeight:height},limitInputPixels:false}).gif({loop:0,delay:Array(frames).fill(60),effort:4,colours:256,dither:.35}).toFile(gif);
    const files=[];
    for(let i=0;i<6;i++){
      const code=await page.evaluate(i=>RankFX.ranks[i].code,i);
      const output=path.join(root,`exports/${code}-loop.webp`);
      await sharp(iconStacks[i],{raw:{width:256,height:256*frames,channels:4,pageHeight:256},limitInputPixels:false}).webp({loop:0,delay:Array(frames).fill(60),quality:94,effort:3}).toFile(output);
      const m=await sharp(output,{animated:true}).metadata();assert.equal(m.pages,frames);assert.equal(m.loop,0);files.push({file:path.basename(output),width:m.width,height:m.pageHeight,frames:m.pages,bytes:fs.statSync(output).size});
    }
    const meta=await sharp(gif,{animated:true}).metadata();assert.equal(meta.pages,frames);assert.equal(meta.loop,0);assert.equal(meta.delay.reduce((a,b)=>a+b,0),6000);assert.deepEqual(errors,[]);
    const source=fs.readFileSync(path.join(root,'assets/rank-chart-square-source-v3.png'));
    const report={status:'ANIMATED_VISUAL_PREVIEW',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),sourcePreserved:true,loopSeconds:6,frames,probe,mobile,errors,gif:{file:'rank-effects-six.gif',width:meta.width,height:meta.pageHeight,frames:meta.pages,bytes:fs.statSync(gif).size},icons:files};
    fs.writeFileSync(path.join(root,'qa/report.json'),JSON.stringify(report,null,2)+'\n');
    console.log('Complete:',JSON.stringify(report));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
