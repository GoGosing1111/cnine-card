const base='/assets/ui/pets/rework-20261114/codex-v3/';
const cache=new Map();
export function preparePetDice(kind){
 if(!cache.has(kind))cache.set(kind,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{cache.delete(kind);reject(Error('주사위 이미지를 불러오지 못했습니다.'));};img.src=base+kind+'-roll.webp';}));
 return cache.get(kind);
}
export async function playPetDice(host,{kind,signal,onFrame=()=>{}}){
 const sprite=host.querySelector('[data-dice-sprite]'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(signal.aborted)return;
 host.dataset.dicePhase='loading';
 try{await preparePetDice(kind);}catch{host.dataset.dicePhase='image-error';return;}
 if(signal.aborted||!host.isConnected)return;
 sprite.style.backgroundImage='url("'+base+kind+'-roll.webp")';
 host.dataset.dicePhase=reduced?'reduced-motion':'rolling';
 const sequence=reduced?[11]:[0,1,2,3,4,5,6,7,4,5,6,7,8,9,10,11],duration=reduced?180:1120;
 return new Promise(resolve=>{
  let frame=0,start=null,last=-1,done=false;
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);signal.removeEventListener('abort',finish);host.dataset.dicePhase='finished';resolve();};
  const tick=time=>{
   if(signal.aborted||!host.isConnected){finish();return;}
   start??=time;const i=Math.min(sequence.length-1,Math.floor((time-start)/duration*sequence.length)),n=sequence[i];
   if(n!==last){sprite.style.backgroundPosition=(n%4/3*100)+'% '+(Math.floor(n/4)/2*100)+'%';sprite.dataset.frame=String(n);last=n;onFrame(n);}
   if(time-start>=duration){finish();return;}frame=requestAnimationFrame(tick);
  };
  signal.addEventListener('abort',finish,{once:true});frame=requestAnimationFrame(tick);
 });
}

