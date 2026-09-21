// Presentation only: a completed receipt is required. No draw/payment API here.
export const MERCENARY_CINEMATICS=Object.freeze({
  SS:Object.freeze({src:'/assets/ui/project-v/mercenary-acquisition/ss-contract-v1.mp4',bytes:3137541,width:1280,height:720,duration:8}),
  SSS:Object.freeze({src:'/assets/ui/project-v/mercenary-acquisition/sss-contract-v1.mp4',bytes:4462564,width:1280,height:720,duration:10.006}),
});
export function mercenaryCinematicFor(result){
  return result?.kind==='MERCENARY'&&result.granted===true&&result.preview===false&&result.receiptId
    ?MERCENARY_CINEMATICS[result.rank]||null:null;
}

export class MercenaryAcquisitionVideo {
  constructor(host,{loadTimeout=20000,stallTimeout=15000}={}){
    this.host=host;this.loadTimeout=loadTimeout;this.stallTimeout=stallTimeout;
    this.assets=new Map();this.active=null;this.disposed=false;this.muted=true;
  }
  // At most two small blobs per dialog. The entire file is validated before play,
  // so a network drop cannot interrupt an already started cinematic.
  load(asset){
    if(this.disposed)return Promise.resolve(null);
    if(this.assets.has(asset.src))return this.assets.get(asset.src).promise;
    const entry={controller:new AbortController(),url:null};
    entry.promise=(async()=>{
      let timer;
      try{
        const blob=await Promise.race([
          (async()=>{
            const response=await fetch(asset.src,{signal:entry.controller.signal,cache:'force-cache',credentials:'same-origin'});
            if(response.status!==200||!/^(video\/mp4|application\/octet-stream)(;|$)/i.test(response.headers.get('content-type')||''))throw Error('영상 응답 오류');
            const body=await response.blob();
            if(body.size!==asset.bytes)throw Error('영상 파일이 완전하지 않습니다.');
            return body;
          })(),
          new Promise((_,reject)=>{entry.reject=reject;timer=setTimeout(()=>{entry.controller.abort();reject(Error('영상 준비 시간 초과'));},this.loadTimeout);}),
        ]);
        if(this.disposed||entry.controller.signal.aborted)return null;
        entry.url=URL.createObjectURL(blob);return entry.url;
      }catch(error){
        if(!this.disposed&&!entry.cancelled)console.warn('MERCENARY_CINEMATIC_UNAVAILABLE',asset.src,error.message);
        return null;
      }finally{clearTimeout(timer);entry.reject=null;}
    })();
    this.assets.set(asset.src,entry);return entry.promise;
  }
  prepare(results){for(const result of results){const asset=mercenaryCinematicFor(result);if(asset)void this.load(asset);}}
  play(result,onState=()=>{}){
    const asset=mercenaryCinematicFor(result);
    if(!asset||this.disposed)return Promise.resolve(false);
    this.cancel();
    return new Promise(resolve=>{
      const surface=document.createElement('div');surface.className='mercenary-cinematic';
      const label=document.createElement('p');label.className='mercenary-cinematic-status';label.setAttribute('role','status');label.textContent=`${result.rank} 계약 연출 준비 중`;
      const badge=document.createElement('span');badge.className='mercenary-cinematic-badge';badge.textContent=`${result.rank} · MERCENARY CONTRACT`;
      surface.append(label,badge);this.host.append(surface);this.host.dataset.cinematic=result.rank;this.host.removeAttribute('aria-hidden');
      const state={surface,paused:false,video:null,lastTime:0,lastProgress:performance.now(),started:false};this.active=state;
      const finish=played=>{
        if(this.active!==state)return;
        this.active=null;clearInterval(state.watchdog);
        if(state.video){for(const [event,handler] of state.listeners||[])state.video.removeEventListener(event,handler);state.video.pause();state.video.removeAttribute('src');state.video.load();state.video.remove();}
        surface.remove();delete this.host.dataset.cinematic;this.host.setAttribute('aria-hidden','true');resolve(played);
      };
      state.finish=finish;
      state.start=()=>{
        if(this.active!==state||state.paused||!state.video||state.video.readyState<2)return;
        state.lastProgress=performance.now();
        Promise.resolve(state.video.play()).then(()=>{
          if(this.active!==state)return;
          if(state.paused){state.video.pause();return;}
          label.hidden=true;onState('playing');
        }).catch(error=>{
          if(this.active!==state||state.paused)return;
          if(error.name==='NotAllowedError'){
            state.paused=true;label.hidden=false;label.textContent='계속 재생을 눌러 연출을 시작하세요.';onState('paused');
          }else{console.warn('MERCENARY_CINEMATIC_PLAY_FAILED',error.message);finish(false);}
        });
      };
      onState('loading');
      void this.load(asset).then(url=>{
        if(this.active!==state)return;
        if(!url){finish(false);return;}
        const video=document.createElement('video');state.video=video;
        video.playsInline=true;video.setAttribute('playsinline','');video.preload='auto';video.muted=this.muted;video.defaultMuted=this.muted;
        video.disablePictureInPicture=true;video.setAttribute('aria-hidden','true');
        const sound=document.createElement('button');sound.type='button';sound.className='mercenary-cinematic-sound';
        const soundLabel=()=>{sound.textContent=this.muted?'소리 켜기':'소리 끄기';sound.setAttribute('aria-pressed',String(!this.muted));};soundLabel();
        sound.onclick=()=>{this.muted=!this.muted;video.muted=this.muted;soundLabel();if(!state.paused)state.start();};
        const progress=document.createElement('div');progress.className='mercenary-cinematic-progress';progress.setAttribute('aria-hidden','true');
        const bar=document.createElement('span');progress.append(bar);
        state.listeners=[
          ['loadedmetadata',()=>{if(video.videoWidth!==asset.width||video.videoHeight!==asset.height||Math.abs(video.duration-asset.duration)>.1)finish(false);}],
          ['canplay',()=>{if(!state.started){state.started=true;state.start();}}],
          ['ended',()=>finish(true)],
          ['error',()=>finish(false)],
          ['pause',()=>{if(this.active===state&&!video.ended&&!state.paused){state.paused=true;onState('paused');}}],
          ['timeupdate',()=>{
            if(video.currentTime>state.lastTime){state.lastProgress=performance.now();state.lastTime=video.currentTime;}
            bar.style.transform=`scaleX(${Math.min(1,video.currentTime/asset.duration)})`;
          }],
        ];
        for(const [event,handler] of state.listeners)video.addEventListener(event,handler);
        surface.prepend(video);surface.append(sound,progress);state.lastProgress=performance.now();
        // Only lack of progress is timed out. Manual/browser pauses never cut a clip.
        state.watchdog=setInterval(()=>{
          if(state.paused){state.lastProgress=performance.now();return;}
          if(performance.now()-state.lastProgress>this.stallTimeout)finish(false);
        },1000);
        video.src=url;video.load();
      });
    });
  }
  setPaused(paused){
    const state=this.active;if(!state)return;
    state.paused=paused;state.lastProgress=performance.now();
    if(paused)state.video?.pause();else state.start();
  }
  cancel(){this.active?.finish(false);}
  destroy(){
    if(this.disposed)return;this.disposed=true;this.cancel();
    for(const entry of this.assets.values()){entry.cancelled=true;entry.controller.abort();entry.reject?.(Error('영상 닫힘'));if(entry.url)URL.revokeObjectURL(entry.url);}
    this.assets.clear();
  }
}

// A safety deadline must not count time deliberately spent paused/in another tab.
export function withPresentationDeadline(promise,isPaused,ms){
  let timer,remaining=ms,last=performance.now();
  const timeout=new Promise((_,reject)=>{timer=setInterval(()=>{
    const now=performance.now();if(!isPaused())remaining-=now-last;last=now;
    if(remaining<=0)reject(Error('개봉 연출이 응답하지 않습니다.'));
  },1000);});
  return Promise.race([promise,timeout]).finally(()=>clearInterval(timer));
}
