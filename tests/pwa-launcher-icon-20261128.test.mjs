import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';

const root=new URL('../',import.meta.url);
const origin='https://cnine-card.pages.dev';
const manifest=JSON.parse(readFileSync(new URL('manifest.webmanifest',root)));
const asset=src=>readFileSync(new URL(new URL(src,origin).pathname.slice(1),root));
const mask=manifest.icons.find(icon=>icon.purpose==='maskable');
const official=JSON.parse(readFileSync(new URL('assets/ui/brand/reverse-call-20261016/manifest.json',root)));

test('installed PWAs keep their identity and advertise regular R icons and an opaque adaptive R',async()=>{
  assert.equal(manifest.id,'/');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.start_url,'/?source=pwa');
  assert.equal(manifest.short_name,'리버스콜');
  assert.match(asset('/index.html').toString(), /rel="manifest" href="\/manifest\.webmanifest\?v=20261016-reverse-call"/);
  const regular=manifest.icons.filter(icon=>icon.purpose==='any');
  assert.deepEqual(regular.map(icon=>icon.sizes).sort(),['192x192','512x512']);
  for(const icon of regular){
    const path=new URL(icon.src,origin).pathname.slice(1);
    const approved=official.files.find(entry=>entry.file===path);
    assert.equal(createHash('sha256').update(asset(icon.src)).digest('hex'),approved.sha256);
  }

  assert.equal(mask.sizes,'512x512');
  const pixels=await sharp(asset(mask.src)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(pixels.info.width,512);
  assert.equal(pixels.info.height,512);
  assert.equal((await sharp(asset(mask.src)).stats()).isOpaque,true);
  const bg=[11,7,27];
  let top=512,bottom=0,radius=0;
  for(let i=0;i<pixels.data.length;i+=3){
    if(bg.every((channel,k)=>Math.abs(pixels.data[i+k]-channel)<26))continue;
    const pos=i/3,x=pos%512,y=Math.floor(pos/512);
    top=Math.min(top,y);bottom=Math.max(bottom,y);
    radius=Math.max(radius,Math.hypot(x+0.5-256,y+0.5-256));
  }
  assert.ok(bottom-top+1>=0.70*512,'a second padding pass would make the mark too small');
  assert.ok(radius<=0.40*512,'the R must fit the PWA maskable safe circle');
  const original=await sharp(asset(regular.find(icon=>icon.sizes==='512x512').src))
    .resize(376,376).flatten({background:'#0b071b'}).removeAlpha().raw().toBuffer();
  const center=await sharp(asset(mask.src)).extract({left:42,top:57,width:376,height:376}).removeAlpha().raw().toBuffer();
  assert.deepEqual(center,original);
});

test('old launcher URLs and offline manifest requests resolve to the precached current artwork',async()=>{
  const shell=new Map(),handlers={};
  const key=request=>new URL(request.url??request,origin).href;
  const cache={
    addAll:async paths=>{
      for(const path of paths){
        const data=asset(path);
        shell.set(key(path),new Response(data,{headers:{'Content-Type':path.includes('manifest.webmanifest')?'application/manifest+json':'image/png'}}));
      }
    },
    match:async request=>shell.get(key(request))?.clone()
  };
  const caches={open:async()=>cache,match:cache.match};
  const self={location:new URL(origin),addEventListener:(type,fn)=>{handlers[type]=fn;},skipWaiting(){}};
  vm.runInNewContext(asset('/service-worker.js').toString(),{
    importScripts(){},self,caches,URL,Request,Response,
    CNineImageDeliveryMap:{map:{'/assets/ui/pwa/soop-20261010/icon-512.png':'/obsolete.webp'}},
    fetch:async()=>{throw Error('offline');}
  });
  let ready;
  handlers.install({waitUntil:promise=>{ready=promise;}});
  await ready;
  const offline=async path=>{
    let result;
    handlers.fetch({request:new Request(key(path)),respondWith:promise=>{result=promise;}});
    assert.ok(result,'missing offline handler for '+path);
    return await result;
  };
  const routes=asset('/_redirects').toString().split(/\r?\n/).filter(line=>line.startsWith('/assets/ui/pwa'));
  assert.equal(routes.length,8);
  for(const line of routes){
    const [old,current,status]=line.split(/\s+/);
    assert.equal(status,'301');
    assert.deepEqual(Buffer.from(await (await offline(old+'?old=1')).arrayBuffer()),asset(current));
  }
  const earlierAdaptive='/assets/ui/brand/reverse-call-20261016/maskable-512.png?v=20261018-transparent';
  assert.deepEqual(Buffer.from(await (await offline(earlierAdaptive)).arrayBuffer()),asset(mask.src));
  assert.deepEqual(await (await offline('/manifest.webmanifest?v=20261016-reverse-call')).json(),manifest);
  for(const icon of manifest.icons)assert.deepEqual(Buffer.from(await (await offline(icon.src)).arrayBuffer()),asset(icon.src));
});
