(()=>{
  'use strict';

  const MANIFEST_URL='/preview/project-v-v3/assets/audio/firearm-qc-v1/manifest.json?v=8-gilded-dragon-battle-suit';
  const AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext||null;
  const activeSources=new Set();
  const sustainedShotGroups=[];
  const bufferPromises=new Map();
  let manifestPromise=null;
  let context=null;
  let lastShot=null;
  let gesturePrimeAttempts=0;
  let gesturePrimeSucceeded=false;
  let audioEpoch=0;

  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const perfNow=()=>globalThis.performance?.now?.()??Date.now();

  function cancellationReason(requestEpoch,isCancelled){
    if(requestEpoch!==audioEpoch)return 'CANCELLED_BY_STOP';
    if(typeof isCancelled!=='function')return '';
    try{return isCancelled()?'CANCELLED_BY_RUN':''}catch{return 'CANCELLED_BY_RUN'}
  }

  function isSupported(){return Boolean(AudioContextClass&&globalThis.fetch)}

  async function loadManifest(){
    manifestPromise||=fetch(MANIFEST_URL,{cache:'force-cache'}).then(response=>{
      if(!response.ok)throw new Error(`FIREARM_QC_MANIFEST_HTTP_${response.status}`);
      return response.json();
    });
    return manifestPromise;
  }

  async function ensureContext(){
    if(!isSupported())return null;
    context||=globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT||new AudioContextClass({latencyHint:'interactive'});
    globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT=context;
    if(context.state==='suspended')await context.resume();
    return context;
  }

  async function unlock(){
    try{return Boolean(await ensureContext())}catch(error){
      console.warn('[Project V V3] firearm QC audio unlock failed',error);
      return false;
    }
  }

  // Mobile browsers only allow AudioContext creation/resume while the original
  // trusted input event is still on the stack. The preview click handler first
  // awaits the V3 renderer, so its later unlock() call is too late on those
  // browsers. Prime synchronously in capture phase, before any renderer await.
  function primeFromTrustedGesture(event){
    if(!event?.isTrusted||!isSupported())return;
    const target=event.target instanceof Element?event.target:null;
    if(!target?.closest?.('#pvBattleSuitFire,#pvBattleSoundToggle,#pvBattleStart,#battleStart,[data-pve-start-button="1"],.battle-sound-toggle'))return;
    gesturePrimeAttempts+=1;
    void ensureContext().then(audioContext=>{
      gesturePrimeSucceeded=audioContext?.state==='running';
    }).catch(error=>{
      gesturePrimeSucceeded=false;
      console.warn('[Project V V3] firearm QC audio gesture prime failed',error);
    });
  }

  if(globalThis.document){
    document.addEventListener('pointerdown',primeFromTrustedGesture,{capture:true,passive:true});
    document.addEventListener('click',primeFromTrustedGesture,{capture:true,passive:true});
  }

  async function profileFor(weaponCode){
    const manifest=await loadManifest();
    const code=String(weaponCode||'').trim().toUpperCase();
    const profile=manifest.profiles?.[code];
    if(!profile)throw new Error(`FIREARM_QC_PROFILE_NOT_FOUND:${code}`);
    return {manifest,profile,weaponCode:code};
  }

  async function loadBuffer(profile){
    if(!bufferPromises.has(profile.asset)){
      bufferPromises.set(profile.asset,(async()=>{
        const audioContext=await ensureContext();
        if(!audioContext)throw new Error('FIREARM_QC_WEB_AUDIO_UNAVAILABLE');
        const response=await fetch(profile.asset,{cache:'force-cache'});
        if(!response.ok)throw new Error(`FIREARM_QC_AUDIO_HTTP_${response.status}`);
        const bytes=await response.arrayBuffer();
        return audioContext.decodeAudioData(bytes.slice(0));
      })());
    }
    return bufferPromises.get(profile.asset);
  }

  async function preload(weaponCode){
    const {profile}=await profileFor(weaponCode);
    if(!isSupported())return {supported:false,profileId:profile.profileId};
    const buffer=await loadBuffer(profile);
    return {supported:true,profileId:profile.profileId,durationMs:buffer.duration*1000};
  }

  function sourceLayer(audioContext,buffer,{kind,when,offsetMs,durationMs,gain,fadeInMs=2,fadeOutMs=20},sourceGroup=null){
    const source=audioContext.createBufferSource();
    const envelope=audioContext.createGain();
    source.buffer=buffer;
    source.__projectVLayer=kind;
    const offset=clamp(finite(offsetMs)/1000,0,Math.max(0,buffer.duration-.001));
    const available=Math.max(.001,buffer.duration-offset);
    const duration=clamp(finite(durationMs,available*1000)/1000,.001,available);
    const start=Math.max(audioContext.currentTime+.001,finite(when,audioContext.currentTime+.001));
    const fadeIn=clamp(finite(fadeInMs)/1000,0,duration*.45);
    const fadeOut=clamp(finite(fadeOutMs)/1000,0,duration*.8);
    const level=clamp(finite(gain,1),0,1);
    envelope.gain.setValueAtTime(0,start);
    envelope.gain.linearRampToValueAtTime(level,start+fadeIn);
    envelope.gain.setValueAtTime(level,Math.max(start+fadeIn,start+duration-fadeOut));
    envelope.gain.linearRampToValueAtTime(0,start+duration);
    source.connect(envelope).connect(audioContext.destination);
    source.onended=()=>{
      activeSources.delete(source);
      sourceGroup?.delete(source);
      if(sourceGroup?.size===0){
        const index=sustainedShotGroups.indexOf(sourceGroup);
        if(index>=0)sustainedShotGroups.splice(index,1);
      }
      try{source.disconnect();envelope.disconnect()}catch{}
    };
    activeSources.add(source);
    sourceGroup?.add(source);
    source.start(start,offset,duration);
    return {kind,start,offset,duration,gain:level};
  }

  function createPlan({manifest,profile,weaponCode,requestedAt,expectedVisualAtPerf,scheduled,layers,reason=''}){
    const output=manifest.runtimeOutput||manifest.previewOutput||{};
    let marked=false;
    const plan={
      weaponCode,
      profileId:profile.profileId,
      weaponClass:profile.weaponClass,
      acousticLabel:profile.acousticLabel,
      outputGain:finite(output.gain,1),
      outputAttenuationDb:finite(output.attenuationDb,0),
      previewOutputGain:finite(output.gain,1),
      previewOutputAttenuationDb:finite(output.attenuationDb,0),
      supported:isSupported(),
      scheduled,
      expectedVisualAtPerf,
      toleranceMs:manifest.visualSync.strongestImpactToleranceMs,
      layers,
      reason,
      markVisualFire(actualAt=perfNow()){
        const actual=finite(actualAt,perfNow());
        const deltaMs=actual-expectedVisualAtPerf;
        marked=true;
        lastShot={
          weaponCode,profileId:profile.profileId,requestedAt,expectedVisualAtPerf,
          actualVisualAtPerf:actual,deltaMs,
          syncPass:Math.abs(deltaMs)<=manifest.visualSync.strongestImpactToleranceMs,
          audioScheduled:scheduled,layerCount:layers.length,reason
        };
        return {...lastShot};
      },
      diagnostics(){return {marked,...lastShot}}
    };
    return plan;
  }

  async function armShot(weaponCode,{enabled=true,visualLeadMs=45,outputScale=1,sourceGroup=null,requestEpoch=audioEpoch,isCancelled=null}={}){
    const requestedAt=perfNow();
    const {manifest,profile,weaponCode:code}=await profileFor(weaponCode);
    const leadMs=Math.max(1,finite(visualLeadMs,manifest.visualSync.authoredReadyLeadMs));
    const cancelledPlan=reason=>createPlan({
      manifest,profile,weaponCode:code,requestedAt,
      expectedVisualAtPerf:perfNow()+leadMs,scheduled:false,layers:[],reason
    });
    let cancelled=cancellationReason(requestEpoch,isCancelled);
    if(cancelled)return cancelledPlan(cancelled);
    if(!enabled){
      const expected=perfNow()+leadMs;
      return createPlan({manifest,profile,weaponCode:code,requestedAt,expectedVisualAtPerf:expected,scheduled:false,layers:[],reason:'MUTED'});
    }
    if(!isSupported()){
      const expected=perfNow()+leadMs;
      return createPlan({manifest,profile,weaponCode:code,requestedAt,expectedVisualAtPerf:expected,scheduled:false,layers:[],reason:'WEB_AUDIO_UNAVAILABLE'});
    }
    const audioContext=await ensureContext();
    cancelled=cancellationReason(requestEpoch,isCancelled);
    if(cancelled)return cancelledPlan(cancelled);
    const buffer=await loadBuffer(profile);
    // stop() may run while a first-use recording is being fetched or decoded.
    // Re-check immediately before creating WebAudio nodes so a closed preview,
    // SOUND OFF action, or cancelled replay cannot resurrect a late shot.
    cancelled=cancellationReason(requestEpoch,isCancelled);
    if(cancelled)return cancelledPlan(cancelled);
    const mix=profile.runtimeMix;
    const runtimeOutputGain=clamp(finite((manifest.runtimeOutput||manifest.previewOutput)?.gain,1),0,1);
    const master=clamp(finite(mix.masterGain,1),0,1)*runtimeOutputGain*clamp(finite(outputScale,1),0,1);
    const scheduleBaseContext=audioContext.currentTime+.012;
    const scheduleBasePerf=perfNow()+12;
    const expectedVisualAtContext=scheduleBaseContext+leadMs/1000;
    const expectedVisualAtPerf=scheduleBasePerf+leadMs;
    const peakMs=finite(profile.final.peakMs);
    const action=mix.action;
    const impact=mix.impact;
    const tail=mix.tail;
    const layers=[
      sourceLayer(audioContext,buffer,{
        kind:'ACTION_NOTICE',when:scheduleBaseContext,
        offsetMs:action.sourceOffsetMs,durationMs:action.durationMs,
        gain:master*action.gain,fadeInMs:action.fadeInMs,fadeOutMs:action.fadeOutMs
      },sourceGroup),
      sourceLayer(audioContext,buffer,{
        kind:'BALLISTIC_IMPACT',when:expectedVisualAtContext-finite(impact.leadInMs)/1000,
        offsetMs:Math.max(0,peakMs-finite(impact.leadInMs)),durationMs:impact.durationMs,
        gain:master*impact.gain,fadeInMs:impact.fadeInMs,fadeOutMs:impact.fadeOutMs
      },sourceGroup),
      sourceLayer(audioContext,buffer,{
        kind:'ACOUSTIC_TAIL',when:expectedVisualAtContext+finite(tail.delayAfterFireMs)/1000,
        offsetMs:peakMs+finite(tail.sourceOffsetAfterPeakMs),durationMs:tail.durationMs,
        gain:master*tail.gain,fadeInMs:tail.fadeInMs,fadeOutMs:tail.fadeOutMs
      },sourceGroup)
    ];
    lastShot={weaponCode:code,profileId:profile.profileId,requestedAt,expectedVisualAtPerf,audioScheduled:true,layerCount:3,syncPass:null};
    return createPlan({manifest,profile,weaponCode:code,requestedAt,expectedVisualAtPerf,scheduled:true,layers});
  }

  function stopSourceGroup(group){
    for(const source of [...group]){
      try{source.stop()}catch{}
      activeSources.delete(source);
      group.delete(source);
    }
  }

  async function armSustainedShot(weaponCode,{enabled=true,visualLeadMs=45,isCancelled=null}={}){
    const requestEpoch=audioEpoch;
    const manifest=await loadManifest();
    const autoMix=(manifest.runtimeOutput||manifest.previewOutput)?.automaticFire||{};
    const maxConcurrentShots=Math.max(1,Math.floor(finite(autoMix.maxConcurrentShots,2)));
    if(cancellationReason(requestEpoch,isCancelled)){
      const plan=await armShot(weaponCode,{
        enabled,visualLeadMs,
        outputScale:clamp(finite(autoMix.shotGain,0.55),0,1),
        requestEpoch,
        isCancelled
      });
      plan.automaticFire=true;
      plan.maxConcurrentShots=maxConcurrentShots;
      return plan;
    }
    while(sustainedShotGroups.length>=maxConcurrentShots)stopSourceGroup(sustainedShotGroups.shift());
    const sourceGroup=new Set();
    sustainedShotGroups.push(sourceGroup);
    try{
      const plan=await armShot(weaponCode,{
        enabled,
        visualLeadMs,
        outputScale:clamp(finite(autoMix.shotGain,0.55),0,1),
        sourceGroup,
        requestEpoch,
        isCancelled
      });
      plan.automaticFire=true;
      plan.maxConcurrentShots=maxConcurrentShots;
      if(!plan.scheduled){
        const index=sustainedShotGroups.indexOf(sourceGroup);
        if(index>=0)sustainedShotGroups.splice(index,1);
      }
      return plan;
    }catch(error){
      stopSourceGroup(sourceGroup);
      const index=sustainedShotGroups.indexOf(sourceGroup);
      if(index>=0)sustainedShotGroups.splice(index,1);
      throw error;
    }
  }

  function stop(){
    audioEpoch+=1;
    for(const source of [...activeSources]){
      try{source.stop()}catch{}
      activeSources.delete(source);
    }
    sustainedShotGroups.length=0;
  }

  function diagnostics(){
    return {
      contract:'PROJECT_V_V3_FIREARM_AUDIO_LIVE_V1',
      previewOnly:false,
      liveRuntimeConnected:true,
      supported:isSupported(),
      contextState:context?.state||'NOT_CREATED',
      gesturePrimeAttempts,
      gesturePrimeSucceeded,
      decodedAssets:bufferPromises.size,
      activeLayers:activeSources.size,
      sustainedShotGroups:sustainedShotGroups.length,
      audioEpoch,
      lastShot:lastShot?{...lastShot}:null
    };
  }

  const api={isSupported,loadManifest,unlock,preload,armShot,armSustainedShot,stop,diagnostics};
  globalThis.ProjectVFirearmAudio=api;
  // Preserve the preview name so existing QC controls exercise the exact same
  // live PVE renderer and recorded assets.
  globalThis.ProjectVFirearmQcAudio=api;
})();
