import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {MERCENARY_CINEMATICS,mercenaryCinematicFor} from '../js/mercenary-acquisition-video.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const result=(rank='SS')=>({kind:'MERCENARY',rank,granted:true,preview:false,receiptId:'saved-receipt',mercenaryCode:rank==='SSS'?'V-021':'V-004'});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness({fetcher,playError}={}){
  let now=0,id=0,playingError=playError;
  const timers=new Map(),created=[],requests=[],urls=[],revoked=[],warnings=[];
  const schedule=(fn,ms,interval=false)=>{const key=++id;timers.set(key,{fn,ms,at:now+ms,interval});return key;};
  class Element extends EventTarget {
    constructor(tag){super();this.tag=tag;this.dataset={};this.style={};this.children=[];this.attributes=new Map();this.readyState=0;this.currentTime=0;this.paused=true;this.ended=false;created.push(this);}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
    prepend(...nodes){for(const node of nodes.reverse()){node.parent=this;this.children.unshift(node);}}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
    setAttribute(key,value){this.attributes.set(key,value);}
    removeAttribute(key){this.attributes.delete(key);if(key==='src')this.src='';}
    load(){if(!this.src)return;this.readyState=2;this.videoWidth=1280;this.videoHeight=720;this.duration=this.src.includes('sss-')?10.006:8;queueMicrotask(()=>{this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('canplay'));});}
    play(){if(playingError)return Promise.reject(playingError);this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
  }
  const context={console:{warn:(...args)=>warnings.push(args)},AbortController,Promise,performance:{now:()=>now},
    setTimeout:(fn,ms)=>schedule(fn,ms),clearTimeout:key=>timers.delete(key),setInterval:(fn,ms)=>schedule(fn,ms,true),clearInterval:key=>timers.delete(key),
    URL:{createObjectURL:blob=>{const url='blob:'+blob.src;urls.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},
    document:{createElement:tag=>new Element(tag)},
    fetch:async(src,options)=>{requests.push({src,options});if(fetcher)return fetcher(src,options);const asset=Object.values(MERCENARY_CINEMATICS).find(row=>row.src===src);return {status:200,headers:{get:()=> 'video/mp4'},blob:async()=>({size:asset.bytes,src})};},
  };
  vm.runInNewContext(read('js/mercenary-acquisition-video.mjs').replace(/^export /gm,'')+'\nglobalThis.api={MercenaryAcquisitionVideo,withPresentationDeadline};',context);
  const host=new Element('div'),controller=new context.api.MercenaryAcquisitionVideo(host);
  return {controller,host,requests,created,urls,revoked,timers,warnings,deadline:context.api.withPresentationDeadline,
    allowPlay(){playingError=null;},video:()=>created.filter(node=>node.tag==='video').at(-1),
    advance(ms){const end=now+ms;for(;;){let next;for(const [key,value] of timers)if(value.at<=end&&(!next||value.at<next[1].at))next=[key,value];if(!next)break;const [key,timer]=next;now=timer.at;if(timer.interval)timer.at+=timer.ms;else timers.delete(key);timer.fn();}now=end;},
  };
}

test('only authoritative SS and SSS mercenary results select their distinct videos',()=>{
  assert.equal(mercenaryCinematicFor(result('SS')),MERCENARY_CINEMATICS.SS);
  assert.equal(mercenaryCinematicFor(result('SSS')),MERCENARY_CINEMATICS.SSS);
  for(const rank of ['C','B','A','S','SSSS','ss'])assert.equal(mercenaryCinematicFor(result(rank)),null);
  for(const patch of [{kind:'MASTER_STAR'},{preview:true},{granted:false},{receiptId:''}])assert.equal(mercenaryCinematicFor({...result(),...patch}),null);
});

test('lazy fetch; mixed ten-draws download each rank once and release both blob URLs',async()=>{
  const h=harness();assert.equal(h.requests.length,0);
  h.controller.prepare(Array.from({length:10},(_,i)=>result(i%2?'SSS':'SS')));await settle();
  assert.equal(h.requests.length,2);assert.equal(h.urls.length,2);
  for(const rank of ['SS','SSS','SS']){const played=h.controller.play(result(rank));await settle();const video=h.video();assert(video.src.includes(rank==='SSS'?'sss-':'ss-'));video.ended=true;video.dispatchEvent(new Event('ended'));assert.equal(await played,true);}
  assert.equal(h.requests.length,2);h.controller.destroy();assert.equal(h.revoked.length,2);assert.equal(h.timers.size,0);assert.equal(h.host.children.length,0);
});

test('playback waits for the entire blob, not just response headers',async()=>{
  let finishBody;const h=harness({fetcher:async src=>({status:200,headers:{get:()=> 'video/mp4'},blob:()=>new Promise(resolve=>finishBody=()=>resolve({size:MERCENARY_CINEMATICS.SS.bytes,src}))})});
  const played=h.controller.play(result());await settle();assert.equal(h.video(),undefined);assert.equal(h.host.dataset.cinematic,'SS');
  finishBody();await settle();assert(h.video().src.startsWith('blob:'));h.controller.cancel();assert.equal(await played,false);h.controller.destroy();
});

test('no hard-coded clip cutoff; full ended event alone advances to the acquired card',async()=>{
  const h=harness();let complete=false;const played=h.controller.play(result()).then(value=>{complete=true;return value;});await settle();
  for(let i=1;i<=12;i++){h.video().currentTime=i*.5;h.video().dispatchEvent(new Event('timeupdate'));h.advance(1000);await settle();}
  assert.equal(complete,false);h.video().ended=true;h.video().dispatchEvent(new Event('ended'));assert.equal(await played,true);h.controller.destroy();
});

test('pause/resume lasts beyond watchdog and browser autoplay denial exposes resume',async()=>{
  const h=harness({playError:Object.assign(Error('gesture required'),{name:'NotAllowedError'})}),states=[];
  const played=h.controller.play(result(),state=>states.push(state));await settle();assert(states.includes('paused'));
  h.advance(120000);await settle();assert(h.controller.active);
  h.allowPlay();h.controller.setPaused(false);await settle();assert.equal(h.video().paused,false);
  h.controller.setPaused(true);h.advance(120000);assert(h.controller.active);assert.equal(h.video().paused,true);
  h.controller.setPaused(false);await settle();h.video().ended=true;h.video().dispatchEvent(new Event('ended'));assert.equal(await played,true);h.controller.destroy();
});

test('truncated files, HTML fallbacks, HTTP failures and decode errors fail closed to existing reveal',async()=>{
  for(const [status,type,size] of [[200,'video/mp4',32],[200,'text/html',MERCENARY_CINEMATICS.SS.bytes],[404,'video/mp4',0],[206,'video/mp4',MERCENARY_CINEMATICS.SS.bytes]]){
    const h=harness({fetcher:async()=>({status,headers:{get:()=>type},blob:async()=>({size})})});assert.equal(await h.controller.play(result()),false);assert.equal(h.video(),undefined);h.controller.destroy();
  }
  const h=harness(),played=h.controller.play(result());await settle();h.video().dispatchEvent(new Event('error'));assert.equal(await played,false);h.controller.destroy();
});

test('stalled download and stalled decoding are bounded without losing saved rewards',async()=>{
  const h=harness({fetcher:()=>new Promise(()=>{})}),played=h.controller.play(result());h.advance(21000);await settle();assert.equal(await played,false);assert.equal(h.requests[0].options.signal.aborted,true);h.controller.destroy();
  const d=harness(),decode=d.controller.play(result());await settle();d.advance(16000);assert.equal(await decode,false);d.controller.destroy();
});

test('skip/close while loading settles immediately and late fetch cannot revive removed video',async()=>{
  let respond;const h=harness({fetcher:src=>new Promise(resolve=>respond=()=>resolve({status:200,headers:{get:()=> 'video/mp4'},blob:async()=>({size:MERCENARY_CINEMATICS.SS.bytes,src})}))});
  const played=h.controller.play(result());h.controller.destroy();assert.equal(await played,false);respond();await settle();
  assert.equal(h.host.children.length,0);assert.equal(h.urls.length,0);assert.equal(h.timers.size,0);assert(h.requests[0].options.signal.aborted);
});

test('sound uses preserved track, defaults safe-muted and never requests another asset',async()=>{
  const h=harness(),played=h.controller.play(result());await settle();assert.equal(h.video().muted,true);assert.equal(h.video().playsInline,true);
  h.created.find(node=>node.tag==='button').onclick();await settle();assert.equal(h.video().muted,false);assert.equal(h.requests.length,1);
  h.controller.destroy();assert.equal(await played,false);
});

test('presentation deadline excludes explicit pauses but still bounds an unresponsive renderer',async()=>{
  const h=harness();let paused=true,rejected=false;
  const wait=h.deadline(new Promise(()=>{}),()=>paused,2000).catch(()=>{rejected=true;});
  h.advance(120000);await settle();assert.equal(rejected,false);paused=false;h.advance(2000);await wait;assert.equal(rejected,true);assert.equal(h.timers.size,0);
});

function atoms(buffer,start=0,end=buffer.length){const list=[];for(let offset=start;offset<end;){const size=buffer.readUInt32BE(offset),type=buffer.toString('ascii',offset+4,offset+8);assert(size>=8&&offset+size<=end);list.push({type,start:offset+8,end:offset+size});offset+=size;}return list;}
function child(buffer,parent,type){return atoms(buffer,parent.start,parent.end).find(atom=>atom.type===type);}
test('compressed assets retain 720p/24fps/full frame counts, AAC and fast-start; hashes and sizes are locked',()=>{
  const manifest=JSON.parse(read('assets/ui/project-v/mercenary-acquisition/manifest-v1.json'));
  for(const row of manifest.videos){
    const asset=MERCENARY_CINEMATICS[row.rank],buffer=readFileSync(new URL('..'+asset.src,import.meta.url));
    assert.equal(buffer.length,row.bytes);assert.equal(asset.bytes,row.bytes);assert(buffer.length<row.sourceBytes*.6);assert(buffer.length<5*1024*1024);
    assert.equal(createHash('sha256').update(buffer).digest('hex'),row.sha256);
    const top=atoms(buffer),moov=top.find(a=>a.type==='moov'),mdat=top.find(a=>a.type==='mdat');assert(moov.start<mdat.start);
    const tracks=atoms(buffer,moov.start,moov.end).filter(a=>a.type==='trak');let video,audio;
    for(const track of tracks){const mdia=child(buffer,track,'mdia'),hdlr=child(buffer,mdia,'hdlr'),handler=buffer.toString('ascii',hdlr.start+8,hdlr.start+12);if(handler==='vide')video={track,mdia};if(handler==='soun')audio={track,mdia};}
    assert(video&&audio);
    const tkhd=child(buffer,video.track,'tkhd');assert.equal(buffer.readUInt32BE(tkhd.end-8)/65536,row.width);assert.equal(buffer.readUInt32BE(tkhd.end-4)/65536,row.height);
    const mdhd=child(buffer,video.mdia,'mdhd'),scale=buffer.readUInt32BE(mdhd.start+12),duration=buffer.readUInt32BE(mdhd.start+16)/scale;assert.equal(duration,row.frames/row.fps);
    const stbl=child(buffer,child(buffer,video.mdia,'minf'),'stbl'),stsz=child(buffer,stbl,'stsz');assert.equal(buffer.readUInt32BE(stsz.start+8),row.frames);
    assert(buffer.includes(Buffer.from('avc1')));assert(buffer.includes(Buffer.from('mp4a')));assert(row.ssim>.98);
  }
});

test('live wiring is receipt-only, cache versions match, no eager video download or payment writes',()=>{
  const live=read('js/mercenary-pack-live.mjs'),fx=read('js/hyper-pack-fx-v2076.src.js'),helper=read('js/mercenary-acquisition-video.mjs');
  assert.match(live,/withPresentationDeadline\(fx\.play\(results\)/);assert.match(live,/cinematic\.destroy\(\)/);
  assert.match(fx,/await this\.cinematic\.play\(results\[index\]/);assert.match(fx,/this\.app\.stop\(\)/);assert.match(fx,/this\.cinematic\?\.destroy\(\)/);
  assert.doesNotMatch(helper,/\/api\/|localStorage|requestId\s*=/);assert.doesNotMatch(read('index.html'),/\.mp4|<script[^>]+hyper-pack-fx/);
  for(const path of ['index.html','js/app.js'])assert.match(read(path),/mercenary-pack-live\.mjs\?v=2145-acquisition-video/);
  assert.match(read('css/mercenary-pack-live.css'),/object-fit:contain/);assert.match(read('css/mercenary-pack-live.css'),/aspect-ratio:16\/9/);
  assert.match(read('css/mercenary-pack-live.css'),/@media\(max-height:500px\)/);assert.match(read('css/mercenary-pack-live.css'),/100dvh - 200px/);
});
