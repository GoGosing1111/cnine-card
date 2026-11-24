// Bake native light and debris offline. The battle renderer only loads a Pixi atlas.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const vendor = process.env.V35_EFFEKSEER_WEBGL;
if (!vendor) throw Error('Set V35_EFFEKSEER_WEBGL to the official 1.70e JS/WASM folder.');
const dir = import.meta.dirname;
const art = JSON.parse(await fs.readFile(path.join(dir,'art-direction.json')));
const out = path.resolve(dir,'../../assets/ui/project-v/monsters/apocalypse-knights-20261124/skills');
await fs.mkdir(out,{recursive:true});
const files = new Map([['/',[path.resolve(dir,'../v35-effects-production-20261102/bake.html'),'text/html']],
  ['/vendor/effekseer.min.js',[path.join(vendor,'effekseer.min.js'),'text/javascript']],
  ['/vendor/effekseer.wasm',[path.join(vendor,'effekseer.wasm'),'application/wasm']]]);
for (const {key} of art) files.set('/native/'+key+'.efk',[path.join(dir,'native',key+'.efk'),'application/octet-stream']);
const server = http.createServer(async(req,res) => {
  const entry = files.get(req.url);
  if (!entry) return res.writeHead(404).end();
  try {const bytes=await fs.readFile(entry[0]);res.writeHead(200,{'Content-Type':entry[1]});res.end(bytes);}
  catch {res.writeHead(500).end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader','--mute-audio']});
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(() => window.ready || window.failures.length);
  const errors = await page.evaluate(() => window.failures);
  if (errors.length) throw Error(errors.join('\n'));
  for (const {key,sha256} of art) {
    const source = await fs.readFile(path.join(dir,'source',key+'.png'));
    if (createHash('sha256').update(source).digest('hex') !== sha256) throw Error(key+' source hash changed');
    const original = await sharp(source).metadata(), cell = original.width/4;
    if (!Number.isInteger(cell) || original.height !== 3*cell || !original.hasAlpha) throw Error(key+' sheet geometry');
    // Remove near-transparent matte noise before packing. Preserve the soft luminous edges.
    const rgba = await sharp(source).ensureAlpha().raw().toBuffer();
    for (let a=3;a<rgba.length;a+=4) rgba[a]=Math.round(Math.max(0,rgba[a]-8)*255/247);
    const raw = {width:original.width,height:original.height,channels:4};
    const frames = {}, layers = [], counts = [], painted = new Set();
    function place(name, index, left, top, size, input) {
      frames[name+'_'+String(index).padStart(2,'0')] = {frame:{x:left,y:top,w:size,h:size},rotated:false,trimmed:false,
        spriteSourceSize:{x:0,y:0,w:size,h:size},sourceSize:{w:size,h:size}};
      layers.push({input,left,top});
    }
    for (let i=0;i<12;i++) {
      const bytes = await sharp(rgba,{raw}).extract({left:(i%4)*cell,top:Math.floor(i/4)*cell,width:cell,height:cell}).resize(352,352).png().toBuffer();
      painted.add(createHash('sha256').update(bytes).digest('hex'));
      place(key,i,i%4*360+4,Math.floor(i/4)*360+4,352,bytes);
    }
    if (painted.size !== 12) throw Error(key+' repeated painted exposure');
    await page.evaluate(key => window.load(key),key);
    for (let i=0;i<24;i++) {
      const t = 1+Math.round(62*i/23);
      const sample = await page.evaluate(t => window.frame(t),t);
      if (sample.glError) throw Error(key+' WebGL error '+sample.glError);
      counts.push(sample.nonzero);
      const bytes = await sharp(Buffer.from(sample.png,'base64')).resize(168,168).png().toBuffer();
      place(key+'-light',i,i%8*176+4,1080+Math.floor(i/8)*176+4,168,bytes);
    }
    const end = await page.evaluate(() => window.frame(96));
    if (end.nonzero || counts.filter(n => n>20).length < 12) throw Error(key+' particle life');
    const size = {w:1440,h:1608}, image = key+'-v2.webp';
    await sharp({create:{width:size.w,height:size.h,channels:4,background:'#00000000'}}).composite(layers)
      .webp({quality:93,alphaQuality:100,effort:5,smartSubsample:true}).toFile(path.join(out,image));
    await fs.writeFile(path.join(out,key+'-v2.json'),JSON.stringify({frames,meta:{image,format:'RGBA8888',size,scale:'1'}})+'\n');
    console.log(key,(await fs.stat(path.join(out,image))).size,'bytes, particle pixels at contact',counts[13]);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
