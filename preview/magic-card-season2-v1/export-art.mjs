import sharp from 'sharp';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {cards} from './catalog.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=path.resolve(import.meta.dirname,'../..'),base=import.meta.dirname,url=process.env.MAGIC_S2_REVIEW_URL||'http://127.0.0.1:8893/preview/magic-card-season2-v1/';
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--mute-audio']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1536},deviceScaleFactor:1});
 await page.goto(url+'pack-art.html');await page.evaluate(()=>document.fonts.ready);await page.locator('main').screenshot({path:path.join(root,'assets/cards/magic-season2-pack-v1.png')});
 fs.mkdirSync(path.join(base,'cards-v2'),{recursive:true});
 for(const slug of ['contract-erosion','command-severance']){
  await page.goto(url+'?export='+slug);await page.waitForFunction(()=>window.__magicS2Ready);await page.evaluate(()=>document.fonts.ready);await page.locator('.card-art').evaluate(img=>img.decode());
  await page.locator('.spell-card').screenshot({path:path.join(base,`cards-v2/${slug}.png`),omitBackground:true});
 }
 await page.setViewportSize({width:2000,height:1400});await page.goto(url+'?poster');await page.waitForFunction(()=>window.__magicS2Ready);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(img=>!img.closest('.pack-showcase')).map(img=>img.decode()));});
 await page.locator('#announcement').screenshot({path:path.join(base,'announcement-v2.png')});
 const entries=[];
 for(const file of ['assets/cards/magic-season2-pack-source-v1.png','assets/cards/magic-season2-pack-v1.png','assets/ui/magic-cards/season2/contract-erosion-source-v1.png','assets/ui/magic-cards/season2/command-severance-source-v1.png']){
  const bytes=fs.readFileSync(path.join(root,file)),{width,height}=await sharp(bytes).metadata();entries.push({file,width,height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),approvedArtwork:false});
 }
 for(const {slug} of cards)await sharp(path.join(root,`assets/ui/magic-cards/season2/${slug}-source-v1.png`)).resize(768,1152).webp({quality:88}).toFile(path.join(root,`assets/ui/magic-cards/season2/${slug}-768-v1.webp`));
 await sharp(path.join(root,'assets/cards/magic-season2-pack-v1.png')).resize(768,1152).webp({quality:88}).toFile(path.join(root,'assets/cards/magic-season2-pack-768-v1.webp'));
 fs.writeFileSync(path.join(base,'art-manifest-v2.json'),JSON.stringify({generatedWith:'built-in image_gen',version:'20260930-v2',newArtworkApproval:'USER_REVIEW_PENDING',previousApprovedManifest:'art-manifest.json',promptSet:'art-prompts-v2.json',typesetting:'pack-art.html',entries},null,2)+'\n');
 console.log('Exported pack, two framed cards, 10-card poster and asset manifest.');
}finally{await browser.close();}
