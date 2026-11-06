import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium,webkit} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.AUCTION_BGM_VOLUME_OUTPUT;
const tone=Buffer.alloc(44+44100*2);tone.write('RIFF');tone.writeUInt32LE(tone.length-8,4);tone.write('WAVEfmt ',8);tone.writeUInt32LE(16,16);tone.writeUInt16LE(1,20);tone.writeUInt16LE(1,22);tone.writeUInt32LE(44100,24);tone.writeUInt32LE(88200,28);tone.writeUInt16LE(2,32);tone.writeUInt16LE(16,34);tone.write('data',36);tone.writeUInt32LE(tone.length-44,40);for(let i=0;i<44100;i++)tone.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/44100)*8192),44+i*2);
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/auction-user-v1.css"><button id="start">시작</button><div id="root"></div><script type="module">
import {createAuctionBgmPlayer} from '/js/auction-user-bgm-v1.mjs';
const NativeAudio=window.Audio,NativeContext=window.AudioContext||window.webkitAudioContext;
window.__contexts=[];window.__contextSupported=typeof NativeContext==='function';
if(window.__contextSupported)window.AudioContext=function(){const context=new NativeContext(),createGain=context.createGain.bind(context);window.__contexts.push(context);context.createGain=()=>{const node=createGain();window.__gain=node;return node;};return context;};
class IOSAudio{constructor(){const audio=new NativeAudio();audio.loop=true;Object.defineProperty(audio,'volume',{get:()=>1,set:()=>{}});window.__audio=audio;return audio;}}
window.__clock=Date.now();
document.querySelector('#start').onclick=()=>{window.__player=createAuctionBgmPlayer({root:document.querySelector('#root'),api:async()=>({events:[]}),AudioClass:IOSAudio,now:()=>window.__clock,pollMs:60000});window.__player.update({active:{id:'fixture'}});window.__player.ingest({events:[{id:'first',lotId:'fixture',sequence:1,nickname:'오디오 검수',amount:100,bgmUrl:'/tone.wav#av=25',startsMs:window.__clock,endsMs:window.__clock+60000}]});window.__analyser=window.__contexts[0].createAnalyser();window.__gain.connect(window.__analyser);};
</script>`;
const server=http.createServer((req,res)=>{const key=new URL(req.url,'http://local').pathname;if(key==='/')return res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(html);if(key==='/tone.wav')return res.writeHead(200,{'content-type':'audio/wav'}).end(tone);if(key.startsWith('/assets/')||key==='/favicon.ico')return res.writeHead(204).end();const file=path.resolve(root,'.'+key);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.writeHead(200,{'content-type':key.endsWith('.css')?'text/css':'text/javascript'}).end(fs.readFileSync(file));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const reports=[];
const rms=page=>page.evaluate(()=>{const b=new Float32Array(window.__analyser.fftSize);window.__analyser.getFloatTimeDomainData(b);return Math.sqrt(b.reduce((sum,n)=>sum+n*n,0)/b.length);});
try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.AUCTION_AUDIO_ENGINE||name===process.env.AUCTION_AUDIO_ENGINE)){
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome',args:['--mute-audio']}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:664}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  if(!await page.evaluate(()=>window.__contextSupported)){assert.equal(name,'webkit');reports.push({engine:name,status:'unavailable',reason:'This Windows WebKit build does not expose AudioContext; WebKit UI is covered by the main browser regression.',physicalDevice:false});console.log(JSON.stringify(reports.at(-1)));continue;}
  await page.locator('#start').click();
  try{await page.waitForFunction(()=>window.__contexts[0]?.state==='running'&&!window.__audio.paused&&window.__audio.currentTime>.1,{},{timeout:10000});}
  catch(error){console.log(JSON.stringify({errors,state:await page.evaluate(()=>({context:window.__contexts[0]?.state,media:{paused:window.__audio?.paused,time:window.__audio?.currentTime,ready:window.__audio?.readyState,error:window.__audio?.error?.code,message:window.__audio?.error?.message},wav:document.createElement('audio').canPlayType('audio/wav'),status:document.querySelector('[data-bgm-status]')?.textContent}))}));throw error;}
  const volume=page.locator('[data-bgm-volume]');assert.equal(await volume.inputValue(),'25');
  await page.waitForTimeout(150);const quarter=await rms(page);assert(quarter>.01&&quarter<.07,quarter);
  const before=await page.evaluate(()=>window.__audio.currentTime);
  await volume.press('End');await page.waitForTimeout(150);const full=await rms(page);assert(full/quarter>3.5&&full/quarter<4.5,{quarter,full});
  await volume.press('Home');await page.waitForTimeout(150);const muted=await rms(page);assert(muted<.00001,muted);
  assert.equal(await page.evaluate(()=>window.__audio.muted),true);assert.equal(await page.locator('[data-bgm-mute]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-bgm-mute]').click();assert.equal(await volume.inputValue(),'100');
  const after=await page.evaluate(()=>({time:window.__audio.currentTime,contexts:window.__contexts.length,gain:window.__gain.gain.value,paused:window.__audio.paused}));assert.equal(after.contexts,1);assert.equal(after.gain,1);assert.equal(after.paused,false);
  await page.locator('[data-bgm-mute]').click();await page.reload();await page.locator('#start').click();await page.waitForFunction(()=>window.__contexts[0]?.state==='running');assert.equal(await volume.inputValue(),'0');assert.equal(await page.evaluate(()=>window.__gain.gain.value),0);await page.locator('[data-bgm-mute]').click();assert.equal(await volume.inputValue(),'100');
  await page.evaluate(()=>window.__player.destroy());await page.waitForFunction(()=>window.__contexts[0].state==='closed');assert.equal(await page.evaluate(()=>window.__audio.paused),true);
  // Invalid saved values must not turn the next song into accidental full volume.
  for(const raw of ['not-json',JSON.stringify({volume:101}),JSON.stringify({volume:'0'})]){
   await page.evaluate(raw=>localStorage.setItem('cnine_auction_bgm_volume_v1',raw),raw);await page.reload();await page.locator('#start').click();assert.equal(await volume.inputValue(),'25');await page.evaluate(()=>window.__player.destroy());
  }
  await page.evaluate(()=>localStorage.removeItem('cnine_auction_bgm_volume_v1'));await page.reload();await page.evaluate(()=>{Storage.prototype.getItem=()=>{throw Error('Storage blocked');};Storage.prototype.setItem=()=>{throw Error('Storage blocked');};});await page.locator('#start').click();await volume.press('End');assert.equal(await volume.inputValue(),'100');await page.evaluate(()=>window.__player.destroy());
  assert.deepEqual(errors,[]);reports.push({engine:name,quarter,full,ratio:full/quarter,muted,before,after,mutedReloadAndRestore:true,invalidPreferences:true,storageDenied:true,contextClosed:true,physicalDevice:false});console.log(JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'audio-report.json'),JSON.stringify(reports,null,2));}}
