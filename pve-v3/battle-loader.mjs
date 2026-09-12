const content=new URL(location.href).searchParams.get('content');
document.body.dataset.content=content||'tower';
const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('전투 모듈을 불러오지 못했습니다.'));document.head.append(s);});
try{await load(content==='idle-dungeon'?'/preview/project-v-v3/project-v-pixi-battle.bundle.js':'/pve-v3/battle.bundle.js');await load('/js/battle-v3-live.js');await import('./battle-bridge.mjs');window.dispatchEvent(new Event('pve-v3-ready'));}
catch(e){document.body.textContent=e.message;}
