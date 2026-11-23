import test from 'node:test';
import assert from 'node:assert/strict';
import {NOX_TRACK,NOX_TRACKS,NOX_LEGACY_TRACKS,NOX_BEAT_GRIDS,NOX_RHYTHM_VERSION,noxTrack,NOX_RHYTHM_RULES} from '../shared/nox-raid-chart-v1.mjs';
import {NoxAudio,noxNoteStart} from '../js/nox-input-v1.mjs';
import {createNoxRoom,addNoxMember,readyNoxMember,startNoxRoom,tickNoxRoom,actNoxRoom,noxEnrageMs,NOX_RULES} from '../functions/_raid_nox.js';
import {NOX_DECK,noxFixture} from './helpers/nox-live-fixture.mjs';

test('61 full songs continue into the final half-second; denser charts keep separated same-lane windows',()=>{
  let oldCount=0,newCount=0;
  for(const t of NOX_TRACKS){
    const old=NOX_LEGACY_TRACKS.find(o=>o.sha256===t.sha256);assert(old);assert.notEqual(t.id,old.id);assert.equal(noxTrack(old.id),old);assert.equal(old.chartEndMs,30000);
    assert.equal(t.chartEndMs,t.durationMs);assert(t.durationMs-t.notes.at(-1).at>=NOX_RHYTHM_RULES.goodMs);assert(t.durationMs-t.notes.at(-1).at<=500);
    assert(t.notes.length>old.notes.length);oldCount+=old.notes.length;newCount+=t.notes.filter(n=>n.at<29000).length;
    for(const lane of [0,1,2,3]){const notes=t.notes.filter(n=>n.lane===lane);for(let i=1;i<notes.length;i++)assert(notes[i].at-notes[i-1].at>=330,t.name);}
    const counts=new Map();for(const n of t.notes)counts.set(n.at,(counts.get(n.at)||0)+1);assert(Math.max(...counts.values())<=2);
  }
  assert(newCount/oldCount>1.2&&newCount/oldCount<1.3);assert.equal(NOX_RHYTHM_RULES.travelMs,1250);
  assert.deepEqual([NOX_RULES.perfectMs,NOX_RULES.goodMs,NOX_RULES.maxMiss,NOX_RULES.accuracy],[80,160,3,.9]);
});

test('Hell adds 75% more playable notes with 800ms travel and preserves Normal chart data',()=>{
  const lobby=createNoxRoom({id:'DIFFICULTY',hostId:'1',size:3,difficulty:'HELL',seed:7});
  for(let i=1;i<=3;i++){
    addNoxMember(lobby,{id:String(i),cards:NOX_DECK});
    readyNoxMember(lobby,String(i));
  }
  for(const track of [...NOX_TRACKS,...NOX_LEGACY_TRACKS,NOX_TRACK]){
    const hell=structuredClone(lobby),legacy=structuredClone(lobby);
    delete legacy.difficulty;
    hell.playlist[0]=legacy.playlist[0]=track.id;
    startNoxRoom(hell,'1',0);startNoxRoom(legacy,'1',0);
    assert.deepEqual(legacy.challenge.chart,track.notes);
    assert.equal(legacy.challenge.travelMs,1250);
    assert.equal(hell.challenge.travelMs,800);
    assert.equal(hell.challenge.deadline,legacy.challenge.deadline);
    const notes=hell.challenge.chart;
    assert.equal(notes.length,Math.round(track.notes.length*1.75),track.id);
    assert.equal(notes[0].at,track.notes[0].at);
    assert.equal(notes.at(-1).at,track.notes.at(-1).at);
    const last=[-Infinity,-Infinity,-Infinity,-Infinity],counts=new Map();
    for(const note of notes){
      assert(note.at-last[note.lane]>=330,track.id);
      last[note.lane]=note.at;
      counts.set(note.at,(counts.get(note.at)||0)+1);
      assert(counts.get(note.at)<=2,track.id);
    }
  }
});

test('a Hell party already in battle before the update uses its previous settings in later rounds',()=>{
  const room=createNoxRoom({id:'LEGACYHELL',hostId:'1',size:3,difficulty:'HELL',seed:7});
  for(let i=1;i<=3;i++){
    addNoxMember(room,{id:String(i),cards:NOX_DECK});
    readyNoxMember(room,String(i));
  }
  startNoxRoom(room,'1',0);
  delete room.hellRhythm;
  room.stage='EXPOSED';
  room.lastAttackAt=room.startedAt;
  room.challenge={stage:'EXPOSED',deadline:room.startedAt+15000};
  room.boss.hp=Math.ceil(room.boss.maxHp*(1-1/3))+1;
  tickNoxRoom(room,room.startedAt+1000);
  assert.equal(room.round,2);
  assert.equal(room.challenge.travelMs,1000);
  assert.equal(room.challenge.chart.length,Math.round(noxTrack(room.playlist[1]).notes.length*1.5));
  assert(room.challenge.chart.every(note=>note.endAt===undefined));
});

test('all 61 tracks keep their beat alignment with tap-only Normal charts and playable holds in Hell',()=>{
  for(const difficulty of ['NORMAL','HELL']){
    const base=createNoxRoom({id:'HOLDCHARTS',hostId:'1',difficulty,size:1,practice:true});
    addNoxMember(base,{id:'1',cards:NOX_DECK});
    readyNoxMember(base,'1');
    let originalError=0,correctedError=0;
    for(const track of NOX_TRACKS){
      const legacy=structuredClone(base),updated=structuredClone(base);
      legacy.playlist[0]=updated.playlist[0]=track.id;
      updated.rhythmVersion=NOX_RHYTHM_VERSION;
      startNoxRoom(legacy,'1');
      startNoxRoom(updated,'1');
      const chart=updated.challenge.chart,original=legacy.challenge.chart;
      assert.equal(chart.length,Math.round(track.notes.length*(difficulty==='HELL'?1.75:1)),track.id);
      assert.equal(chart.some(note=>note.endAt!==undefined),difficulty==='HELL',track.id);
      const grid=NOX_BEAT_GRIDS[track.id],previous=[];
      for(const [i,note] of chart.entries()){
        const before=previous[note.lane];
        assert(!before||note.at-before.at>=330,track.id);
        assert(!before?.endAt||note.at-before.endAt>NOX_RULES.goodMs,track.id);
        assert(Math.abs(note.at-original[i].at)<=65,track.id);
        if(note.endAt!==undefined){
          assert(note.endAt-note.at>=420&&note.endAt-note.at<=NOX_RULES.holdMaxMs,track.id);
          assert(note.endAt<=track.chartEndMs-NOX_RULES.goodMs,track.id);
        }
        previous[note.lane]=note;
        if(grid){
          const step=grid.periodMs/4;
          const distance=at=>Math.abs(at-(grid.phaseMs+Math.round((at-grid.phaseMs)/step)*step));
          originalError+=distance(original[i].at);
          correctedError+=distance(note.at);
        }else assert.equal(note.at,original[i].at,track.id);
      }
    }
    assert(correctedError<originalError/3,difficulty);
  }
});

test('longest three songs finish every mechanic in 3/6 players without early enrage or early music cutoff',()=>{
 for(const difficulty of ['NORMAL','HELL'])for(const size of [3,6]){
  const room=createNoxRoom({id:'FULLSONG01',hostId:'1',size,difficulty,rhythmVersion:NOX_RHYTHM_VERSION,seed:7});room.playlist=[...NOX_TRACKS].sort((a,b)=>b.durationMs-a.durationMs).slice(0,3).map(t=>t.id);
  for(let i=1;i<=size;i++){addNoxMember(room,{id:String(i),cards:NOX_DECK});readyNoxMember(room,String(i));}startNoxRoom(room,'1',0);
  assert.equal(room.endsAt-room.startedAt,120000+room.playlist.reduce((s,id)=>s+noxTrack(id).durationMs,0));
  const send=(m,inputs,now)=>actNoxRoom(room,m.id,{seq:m.lastSequence+1,challengeId:room.challenge.id,inputs},now);
  for(let round=1;round<=3;round++){
    let c=room.challenge;assert.equal(room.round,round);
    const actions=c.chart.flatMap(n=>[
      {lane:n.lane,at:c.musicStartAt+n.at},
      ...(n.endAt===undefined?[]:[{lane:n.lane,at:c.musicStartAt+n.endAt,release:true}])
    ]).sort((a,b)=>a.at-b.at);
    for(const action of actions)for(const m of room.members)send(m,[action],action.at+40);
    tickNoxRoom(room,c.musicStartAt+noxTrack(c.trackId).durationMs);assert.equal(room.stage,'RHYTHM');
    tickNoxRoom(room,c.deadline);assert.equal(room.stage,'MEMORY');c=room.challenge;
    const steps=difficulty==='HELL'?5:3;
    assert.equal(c.sequence.length,steps);
    assert.equal(c.tiles.filter(t=>t.kind==='mine').length,30-steps);
    assert.equal(c.revealEnd-c.startsAt,steps*(c.cueMs+c.gapMs));
    for(const m of room.members)send(m,c.sequence.map(lane=>({lane,at:c.revealEnd+30})),c.revealEnd+300);
    tickNoxRoom(room,c.deadline+NOX_RULES.receiptGraceMs);assert.equal(room.stage,'COOP');c=room.challenge;
    for(const m of room.members)send(m,[{lane:m.role,at:c.targetAt}],c.targetAt+500);
    tickNoxRoom(room,c.deadline+NOX_RULES.receiptGraceMs);assert.equal(room.stage,'EXPOSED');
    while(room.status==='ACTIVE'&&room.stage==='EXPOSED')tickNoxRoom(room,room.clock+1000);
  }
  assert.equal(room.status,'CLEAR',JSON.stringify(room.failure));assert(room.finishedAt<room.endsAt);
 }
 assert.equal(noxEnrageMs(NOX_LEGACY_TRACKS.slice(0,3).map(t=>t.id)),210000);assert.equal(noxEnrageMs(),210000);
});

test('old 31-second-buffer clients must refresh before creating/preparing full-song rooms',async t=>{
 const f=await noxFixture(t);assert.equal((await f.command('create',{size:3,clientVersion:3})).body.code,'NOX_CLIENT_UPDATE');
 const {roomId}=await f.party(3);assert.equal((await f.command('start',{roomId,clientVersion:3})).body.code,'NOX_CLIENT_UPDATE');
});

test('visible-note lookup includes chords and late-window edges after forwards/backwards clock corrections',()=>{
 const notes=NOX_TRACKS.find(t=>t.notes.length===Math.max(...NOX_TRACKS.map(t=>t.notes.length))).notes;
 for(const age of [0,5000,15000,65000,9000,80000,1000]){const from=age-160,to=age+1250,start=noxNoteStart(notes,from),visible=[];for(let i=start;i<notes.length&&notes[i].at<=to;i++)visible.push(notes[i]);assert.deepEqual(visible,notes.filter(n=>n.at>=from&&n.at<=to));}
 const chord=notes.find((n,i)=>notes[i+1]?.at===n.at);assert.equal(notes[noxNoteStart(notes,chord.at)].at,chord.at);
});

test('successful-hit audio is short, cached and bounded; empty inputs/suspended audio create no voices and exit releases all',()=>{
 let allocations=0;const sources=[];
 const ctx={state:'running',sampleRate:48000,destination:{},createBuffer(channels,length,rate){allocations++;const data=new Float32Array(length);return {length,duration:length/rate,getChannelData:()=>data};},createBufferSource(){const s={connect(){},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}};sources.push(s);return s;},createGain:()=>({gain:{},connect(){},disconnect(){}})};
 const audio=new NoxAudio();audio.context=ctx;audio.musicStartAt=123;audio.startContext=10;
 audio.hit('EMPTY');assert.equal(allocations,0);
 for(let i=0;i<30;i++)audio.hit(i%2?'PERFECT':'GOOD');assert.equal(allocations,2);assert.equal(audio.hitVoices.size,6);assert.equal(audio.musicStartAt,123);assert.equal(audio.startContext,10);
 assert(sources.slice(0,-6).every(s=>s.disconnected&&s.stopped));
 for(const b of audio.hitBuffers.values()){const data=b.getChannelData(0);assert(b.duration<=.111);assert(data.some(v=>Math.abs(v)>.1));assert(Math.max(...data.map(Math.abs))<.9);assert(Math.abs(data.at(-1))<.01);}
 sources.at(-1).onended();assert.equal(audio.hitVoices.size,5);ctx.state='suspended';audio.hit('PERFECT');assert.equal(audio.hitVoices.size,5);
 audio.stop();audio.clear();assert.equal(audio.hitVoices.size,0);assert.equal(audio.hitBuffers.size,0);assert(sources.every(s=>s.disconnected&&s.stopped));
});
