import {cowPortalPrompt} from './cow-room-portal.mjs';
const destinations=new Set(['tower','scrapyard','cow-room','idle-dungeon']);
const feature=fetch('/api/pve/v3/feature',{cache:'no-store'}).then(r=>r.ok?r.json():{enabled:false}).catch(()=>({enabled:false}));
globalThis.PveV3Runtime={async tryOpen(content){
  const release=await feature;
  if(content==='tower'&&release.publicContent?.TOWER?.policy==='LEGACY')return false;
  if(!destinations.has(content)||release.enabled!==true&&release.publicContent?.[content.replaceAll('-','_').toUpperCase()]?.enabled!==true)return false;
  if(content==='cow-room'){location.assign('/pve-v3/?content=cow-room');return true;}
  location.assign(`/pve-v3/?content=${encodeURIComponent(content)}`);return true;
}};
feature.then(value=>{
  if(value.enabled!==true&&value.publicContent?.COW_ROOM?.enabled!==true)return;
  let available=0;
  const update=()=>{const button=document.querySelector('[data-v3-cow-entry]');if(button){button.hidden=false;const detail=button.querySelector('small');if(detail)detail.textContent=available>0?`포탈 ${available}개`:'COW PORTAL';else button.textContent=available>0?`카우방 · 포탈 ${available}개`:'카우방';}};
  window.addEventListener('cow-portal:availability',event=>{available=Number(event.detail?.available||0);update();});
  const add=()=>{
    const nav=document.querySelector('.pve-mode-tabs');if(!nav||nav.querySelector('[data-v3-cow-entry]'))return;
    const button=document.createElement('button');button.className='pve-mode-btn';button.dataset.v3CowEntry='';button.type='button';button.hidden=true;
    button.onclick=()=>void globalThis.PveV3Runtime.tryOpen('cow-room');nav.append(button);globalThis.PveCommandV2Live?.syncModeNavigation();update();
    if(value.enabled===true){const mercenary=document.createElement('a');mercenary.className='pve-mode-btn';mercenary.href='/mercenary-hangar/';mercenary.textContent='용병 지휘소';nav.append(mercenary);}
  };
  add();const observer=new MutationObserver(add);observer.observe(document.body,{childList:true,subtree:true});
  if(localStorage.getItem('cnine_card_api_token')&&!document.querySelector('.battle-modal.show'))void cowPortalPrompt.recover();
  addEventListener('pagehide',()=>observer.disconnect(),{once:true});
});
