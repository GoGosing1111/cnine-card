const grid=document.getElementById('fxGrid');
const template=document.getElementById('fxCardTemplate');
const playAllButton=document.getElementById('playAll');
const volumeInput=document.getElementById('masterVolume');
const volumeValue=document.getElementById('masterVolumeValue');
const loopInput=document.getElementById('visualLoop');
const prefersReducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const states=[];
let masterSequence=0;

const pad=value=>String(value).padStart(2,'0');
const wait=duration=>new Promise(resolve=>setTimeout(resolve,duration));

const ACCENTS={
  critical:'#ff5a43',counter:'#39bfff',ultimate:'#b77aff',
  'boss-ultimate':'#ff4053',dodge:'#42e4ff',revive:'#54efb7'
};

function framePath(effect,index){
  return effect.framePattern.replace('%02d',pad(index));
}

function setFrame(state,index){
  const frame=Math.max(0,Math.min(state.effect.frameCount-1,Number(index)||0));
  state.frame=frame;
  const {ctx,image,effect}=state;
  const column=frame%effect.atlasColumns;
  const row=Math.floor(frame/effect.atlasColumns);
  ctx.clearRect(0,0,effect.frameSize,effect.frameSize);
  ctx.globalCompositeOperation='screen';
  ctx.drawImage(image,column*effect.frameSize,row*effect.frameSize,effect.frameSize,effect.frameSize,0,0,effect.frameSize,effect.frameSize);
  ctx.globalCompositeOperation='source-over';
  state.counter.textContent=`FRAME ${pad(frame)} / ${pad(effect.frameCount-1)}`;
  state.scrubber.value=String(frame);
  state.scrubberOutput.value=pad(frame);
  state.dots.forEach((dot,dotIndex)=>dot.classList.toggle('is-active',dotIndex===frame));
  state.thumbnails.forEach((button,buttonIndex)=>button.classList.toggle('is-active',buttonIndex===frame));
  if(frame===effect.collisionFrame){
    state.card.classList.remove('is-impact');
    void state.card.offsetWidth;
    state.card.classList.add('is-impact');
  }
}

function cancel(state,{stopAudio=true}={}){
  state.runToken+=1;
  if(state.raf)cancelAnimationFrame(state.raf);
  state.raf=0;
  state.card.classList.remove('is-playing','is-impact');
  if(stopAudio){
    state.audio.pause();
    state.audio.currentTime=0;
    state.waveProgress.style.width='0%';
  }
}

function playEffect(state,{sound=false,hold=true}={}){
  cancel(state,{stopAudio:true});
  const token=state.runToken;
  const effect=state.effect;
  const start=performance.now();
  const frameDuration=1000/effect.fps;
  const animationDuration=frameDuration*effect.frameCount;
  state.card.classList.add('is-playing');
  if(sound){
    state.audio.volume=Number(volumeInput.value);
    state.audio.currentTime=0;
    state.audio.play().catch(()=>{});
  }
  return new Promise(resolve=>{
    const tick=now=>{
      if(token!==state.runToken){resolve(false);return}
      const elapsed=now-start;
      const frame=Math.min(effect.frameCount-1,Math.floor(elapsed/frameDuration));
      setFrame(state,frame);
      if(sound&&Number.isFinite(state.audio.duration)&&state.audio.duration>0){
        state.waveProgress.style.width=`${Math.min(100,state.audio.currentTime/state.audio.duration*100)}%`;
      }
      if(elapsed<animationDuration){state.raf=requestAnimationFrame(tick);return}
      state.card.classList.remove('is-playing','is-impact');
      state.raf=0;
      if(hold)setTimeout(()=>{if(token===state.runToken)setFrame(state,effect.collisionFrame)},240);
      resolve(true);
    };
    state.raf=requestAnimationFrame(tick);
  });
}

function scheduleSilentLoop(state,delay){
  const loop=async()=>{
    if(!loopInput.checked||document.hidden){
      setFrame(state,state.effect.collisionFrame);
      setTimeout(loop,1100);
      return;
    }
    if(!state.audio.paused&&!state.audio.ended){
      setTimeout(loop,320);
      return;
    }
    await playEffect(state,{sound:false,hold:false});
    setFrame(state,state.effect.collisionFrame);
    setTimeout(loop,1100+delay);
  };
  setTimeout(loop,delay);
}

function createCard(effect,index){
  const card=template.content.firstElementChild.cloneNode(true);
  card.style.setProperty('--accent',ACCENTS[effect.id]||'#62dfff');
  card.dataset.effect=effect.id;
  card.querySelector('.card-index').textContent=pad(index+1);
  card.querySelector('h3').textContent=effect.labelKo;
  card.querySelector('.card-head p').textContent=effect.label;
  card.querySelector('.fps-pill').textContent=`${effect.fps} FPS · ${effect.frameCount}F`;
  card.querySelector('.collision-spec').textContent=`F${pad(effect.collisionFrame)} · ${effect.syncPointMs}ms`;
  card.querySelector('.audio-spec').textContent=`${(effect.durationMs/1000).toFixed(2)}s · 48kHz · REC`;
  card.querySelector('.design-spec').textContent=effect.design;

  const canvas=card.querySelector('canvas');
  const ctx=canvas.getContext('2d',{alpha:true});
  const image=new Image();
  image.decoding='async';
  image.src=effect.atlas;
  const audio=new Audio(effect.src||effect.audio);
  audio.preload='auto';
  audio.hidden=true;
  card.append(audio);
  const waveform=card.querySelector('.waveform img');
  waveform.src=effect.waveform;
  waveform.alt=`${effect.labelKo} 사운드 파형`;
  const dots=Array.from({length:effect.frameCount},(_,dotIndex)=>{
    const dot=document.createElement('i');
    dot.classList.toggle('is-collision',dotIndex===effect.collisionFrame);
    card.querySelector('.timeline-row').append(dot);
    return dot;
  });
  const thumbnails=Array.from({length:effect.frameCount},(_,frameIndex)=>{
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('aria-label',`${effect.labelKo} ${frameIndex}번 프레임`);
    const img=document.createElement('img');
    img.loading='lazy';
    img.src=framePath(effect,frameIndex);
    img.alt='';
    const number=document.createElement('small');
    number.textContent=pad(frameIndex);
    button.append(img,number);
    card.querySelector('.frame-strip').append(button);
    return button;
  });
  const state={
    effect,card,canvas,ctx,image,audio,dots,thumbnails,frame:effect.collisionFrame,runToken:0,raf:0,
    counter:card.querySelector('.frame-counter'),
    scrubber:card.querySelector('.scrubber input'),
    scrubberOutput:card.querySelector('.scrubber output'),
    waveProgress:card.querySelector('.waveform i')
  };
  image.addEventListener('load',()=>setFrame(state,effect.collisionFrame),{once:true});
  state.scrubber.addEventListener('input',event=>{cancel(state);setFrame(state,event.currentTarget.value)});
  thumbnails.forEach((button,frameIndex)=>button.addEventListener('click',()=>{cancel(state);setFrame(state,frameIndex)}));
  card.querySelector('.play-sound').addEventListener('click',()=>playEffect(state,{sound:true}));
  card.querySelector('.play-silent').addEventListener('click',()=>playEffect(state,{sound:false}));
  audio.addEventListener('timeupdate',()=>{
    if(audio.duration)state.waveProgress.style.width=`${Math.min(100,audio.currentTime/audio.duration*100)}%`;
  });
  audio.addEventListener('ended',()=>{state.waveProgress.style.width='100%';setTimeout(()=>state.waveProgress.style.width='0%',180)});
  grid.append(card);
  states.push(state);
  if(!prefersReducedMotion)scheduleSilentLoop(state,900+index*280);
}

async function playAll(){
  const sequence=++masterSequence;
  playAllButton.disabled=true;
  playAllButton.querySelector('span').childNodes[0].nodeValue='순차 재생 중 ';
  for(const state of states){
    if(sequence!==masterSequence)break;
    state.card.scrollIntoView({behavior:prefersReducedMotion?'auto':'smooth',block:'center'});
    await wait(180);
    await playEffect(state,{sound:true});
    await wait(Math.max(220,state.effect.durationMs-(state.effect.frameCount/state.effect.fps*1000)));
  }
  if(sequence===masterSequence){
    playAllButton.disabled=false;
    playAllButton.querySelector('span').childNodes[0].nodeValue='6종 순차 재생 ';
  }
}

volumeInput.addEventListener('input',()=>{
  const value=Number(volumeInput.value);
  volumeValue.value=`${Math.round(value*100)}%`;
  states.forEach(state=>state.audio.volume=value);
});
playAllButton.addEventListener('click',playAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)states.forEach(state=>cancel(state))});

fetch('manifest.json?v=3',{cache:'no-store'})
  .then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json()})
  .then(manifest=>manifest.effects.forEach(createCard))
  .catch(error=>{grid.innerHTML=`<p class="load-error">프리뷰 매니페스트를 불러오지 못했습니다: ${String(error.message||error)}</p>`});
