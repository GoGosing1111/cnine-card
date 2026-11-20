import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NOX_TRACK,NOX_TRACKS,NOX_RHYTHM_RULES,noxPlaylist,noxTrack,judgeNoxNote} from '../shared/nox-raid-chart-v1.mjs';
import {nearestNoxNote,eventTime,noxNoteY,noxHitY,NoxAudio} from '../js/nox-input-v1.mjs';
import {createNoxRoom,addNoxMember,readyNoxMember,startNoxRoom,actNoxRoom,tickNoxRoom,noxView,NOX_RULES} from '../functions/_raid_nox.js';
import {NOX_DECK,noxFixture} from './helpers/nox-live-fixture.mjs';
function party(trackId){const r=createNoxRoom({id:'123456789A',hostId:'1',size:3,seed:8});if(trackId)r.playlist[0]=trackId;for(let i=1;i<=3;i++){addNoxMember(r,{id:String(i),cards:NOX_DECK});readyNoxMember(r,String(i));}startNoxRoom(r,'1',0);return r;}
test('early/late edge judgments agree, including key event queued behind a long frame',()=>{
 const notes=[{id:0,lane:0,at:1000},{id:1,lane:0,at:1500},{id:2,lane:1,at:1000}],hits=new Set();
 for(const delta of [-161,-160,-81,-80,0,80,81,160,161]){const a=nearestNoxNote(notes,hits,0,1000+delta),b=judgeNoxNote(notes,hits,0,1000+delta);assert.deepEqual(a,b);assert.equal(a?.grade,Math.abs(delta)>160?undefined:Math.abs(delta)>80?'GOOD':'PERFECT');}
 hits.add(0);assert.equal(nearestNoxNote(notes,hits,0,1000),null);assert.equal(nearestNoxNote(notes,hits,1,1000).note.id,2);
 assert.equal(eventTime({timeStamp:1000},1250,1700000000000),1000);assert.equal(eventTime({timeStamp:1700000001000},1250,1700000000000),1000);
 for(const height of [64,110,280,550])for(const noteHeight of [48,56]){const y=noxHitY(height,noteHeight);assert.equal(noxNoteY(1000,1000,y,noteHeight)+noteHeight/2,y);assert(noxNoteY(1000,1160,y,noteHeight)+noteHeight<=height+1e-7);}
});
test('every measured auction song has a distinct chart; all members receive one nonrepeating playlist',()=>{
 assert.equal(NOX_TRACKS.length,61);assert.equal(new Set(NOX_TRACKS.map(t=>t.sha256)).size,61);
 const selected=new Set();for(let seed=0;seed<1000;seed++){const p=noxPlaylist(seed);assert.equal(new Set(p).size,3);assert.deepEqual(p,noxPlaylist(seed));p.forEach(id=>selected.add(id));}assert.equal(selected.size,61);
 for(const t of NOX_TRACKS){assert(t.notes.length>=48);assert(t.durationMs>=31000);assert.equal(t.chartEndMs,t.durationMs);assert.equal(new Set(t.notes.map(n=>n.id)).size,t.notes.length);for(let i=0;i<t.notes.length;i++){const n=t.notes[i];assert(n.lane>=0&&n.lane<=3);assert(n.at>=5000&&n.at<=t.durationMs-160);if(i)assert(t.notes[i-1].at<=n.at);assert(t.notes.filter(other=>other.lane===n.lane&&Math.abs(other.at-n.at)<320).length===1);}}
 const r=party();for(const m of r.members)assert.deepEqual(noxView(r,m.id).playlist,r.playlist);assert.equal(r.challenge.trackId,r.playlist[0]);assert.deepEqual(r.challenge.chart,noxTrack(r.challenge.trackId).notes);
});
test('all 61 charts survive on GOOD with three misses and reach the real memory stage',()=>{
 for(const track of NOX_TRACKS){const r=party(track.id),c=r.challenge;for(const n of c.chart.slice(3)){const at=c.musicStartAt+n.at+120;for(const m of r.members)actNoxRoom(r,m.id,{seq:m.lastSequence+1,challengeId:c.id,inputs:[{lane:n.lane,at}]},at+20);}
  for(const m of r.members){assert.equal(m.hits.length,c.chart.length-3);assert(Math.abs(m.score-(c.chart.length-3)*.95)<1e-6);}
  tickNoxRoom(r,c.deadline);assert.equal(r.stage,'MEMORY',track.name);assert(r.members.every(m=>m.hp>0));assert.equal(r.challenge.tiles.filter(t=>t.kind==='mine').length,27);
 }
});
test('four misses, empty-lane spam and out-of-window input still fail; legacy rooms retain their song',()=>{
 const r=party(),c=r.challenge;for(const n of c.chart.slice(4)){const at=c.musicStartAt+n.at;for(const m of r.members)actNoxRoom(r,m.id,{seq:m.lastSequence+1,challengeId:c.id,inputs:[{lane:n.lane,at}]},at);}
 tickNoxRoom(r,c.deadline);assert.equal(r.status,'FAILED');
 const legacy=createNoxRoom({id:'123456789A',hostId:'1',size:3});delete legacy.playlist;for(let i=1;i<=3;i++){addNoxMember(legacy,{id:String(i),cards:NOX_DECK});readyNoxMember(legacy,String(i));}startNoxRoom(legacy,'1',0);assert.deepEqual(legacy.challenge.chart,NOX_TRACK.notes);
 const r2=party(),c2=r2.challenge,m=r2.members[0],at=c2.musicStartAt+c2.chart[0].at-161;actNoxRoom(r2,'1',{seq:1,challengeId:c2.id,inputs:[{lane:c2.chart[0].lane,at}]},at);assert.equal(m.hits.length,0);assert.equal(m.score,0);
 const spam=party(),sc=spam.challenge,sm=spam.members[0],note=sc.chart[0],hitAt=sc.musicStartAt+note.at;actNoxRoom(spam,'1',{seq:1,challengeId:sc.id,inputs:[{lane:note.lane,at:hitAt}]},hitAt);assert.equal(sm.score,1);actNoxRoom(spam,'1',{seq:2,challengeId:sc.id,inputs:[{lane:note.lane,at:hitAt},{lane:note.lane,at:hitAt}]},hitAt);assert.equal(sm.score,0);assert.equal(sm.hits.length,1);
 assert.equal(NOX_RULES.accuracy,.9);assert.equal(NOX_RULES.maxMiss,3);assert.equal(NOX_RHYTHM_RULES.goodScore,.95);
});
test('stale fixed-song clients cannot create or join random-song rooms',async t=>{
 const h=await noxFixture(t);assert.equal((await h.command('create',{size:3,clientVersion:1})).body.code,'NOX_CLIENT_UPDATE');
 const created=await h.command('create',{size:3});assert.equal(created.status,200);assert.equal((await h.command('join',{roomId:created.body.roomId,clientVersion:1},2)).body.code,'NOX_CLIENT_UPDATE');
});
test('audio caches by URL, schedules the selected track and discards unfinished work on exit',async t=>{
 const previous=globalThis.fetch;let downloads=0,resolveDecode,delayed=false;
 const sample=(value,length=1600)=>({length,numberOfChannels:1,sampleRate:40,duration:length/40,getChannelData:()=>new Float32Array(length).fill(value)});
 const ctx={state:'running',currentTime:10,destination:{},getOutputTimestamp:()=>({contextTime:9.9,performanceTime:1000}),decodeAudioData:async bytes=>delayed?await new Promise(r=>resolveDecode=r):sample(new Uint8Array(bytes)[0]),createBuffer:(_channels,length,rate)=>({length,sampleRate:rate,numberOfChannels:1,duration:length/rate,copyToChannel(data){this.first=data[0];}}),createBufferSource:()=>({connect(){},disconnect(){},start(...args){this.started=args;},stop(){}}),createGain:()=>({gain:{},connect(){},disconnect(){}}),suspend:async()=>{ctx.state='suspended';}};
 globalThis.fetch=async url=>{downloads++;return {ok:true,arrayBuffer:async()=>Uint8Array.of(url==='/a'?1:2).buffer};};t.after(()=>globalThis.fetch=previous);
 const a=new NoxAudio();a.context=ctx;await a.prepareAll(['/a','/b','/a']);assert.equal(downloads,2);assert.equal(a.buffers.size,2);assert.equal(a.buffers.get('/a').length,1600);
 a.schedule('/a',20000,19000);assert.equal(a.source.buffer.getChannelData(0)[0],1);assert.deepEqual(a.source.started,[11,0]);assert(Math.abs(a.timeAt(2100))<1e-7);
 a.schedule('/b',20000,19000);assert.equal(a.source.buffer.getChannelData(0)[0],2);assert.equal(a.trackUrl,'/b');
 delayed=true;const pending=a.prepare('/c');await new Promise(r=>setTimeout(r,0));await a.suspend();resolveDecode(sample(3));await assert.rejects(pending,{name:'AbortError'});assert.equal(a.buffers.size,0);assert.equal(a.loading.size,0);assert.equal(a.source,null);
});
test('Nox battle bundle carries the shared renderer runtime instead of loading a second engine',()=>{
 const renderer=fs.readFileSync('js/battle-v3-live.js','utf8'),runtime=renderer.match(/const BATTLE_RUNTIME = '([^']+)'/)[1];assert(fs.readFileSync('raid/nox/battle.bundle.js','utf8').includes(runtime));
});
