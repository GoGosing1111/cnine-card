import './cow-room-portal.mjs?v=2093';
const destinations=new Set(['tower','scrapyard','cow-room','idle-dungeon']);
const feature=fetch('/api/pve/v3/feature',{cache:'no-store'}).then(r=>r.ok?r.json():{enabled:false}).catch(()=>({enabled:false}));
globalThis.PveV3Runtime={async tryOpen(content,options={}){
  // Scrapyard keeps its original production entry, controls and recovery flow.
  if(content==='scrapyard')return false;
  const release=await feature;
  if(content==='tower'&&release.publicContent?.TOWER?.policy==='LEGACY')return false;
  if(!destinations.has(content)||release.enabled!==true&&release.publicContent?.[content.replaceAll('-','_').toUpperCase()]?.enabled!==true)return false;
  if(content==='cow-room'){const live=await import('./cow-room-live.mjs?v=2096');return live.open(options);}
  location.assign(`/pve-v3/?content=${encodeURIComponent(content)}`);return true;
}};
feature.then(value=>{
  if(value.enabled!==true&&value.publicContent?.COW_ROOM?.enabled!==true)return;
  let available=0;
  const update=()=>{const button=document.querySelector('[data-v3-cow-entry]');if(button){button.hidden=false;const detail=button.querySelector('small');if(detail)detail.textContent=available>0?`포탈 ${available}개`:'COW PORTAL';else button.textContent=available>0?`카우방 · 포탈 ${available}개`:'카우방';}};
  window.addEventListener('cow-portal:availability',event=>{available=Number(event.detail?.available||0);update();});
  let requestedCow=new URL(location.href).searchParams.get('pve')==='cow-room';
  const add=()=>{
    const nav=document.querySelector('.pve-mode-tabs');if(!nav||nav.querySelector('[data-v3-cow-entry]'))return;
    const button=document.createElement('button');button.className='pve-mode-btn';button.dataset.v3CowEntry='';button.type='button';button.hidden=true;
    button.onclick=()=>void globalThis.PveV3Runtime.tryOpen('cow-room');nav.append(button);globalThis.PveCommandV2Live?.syncModeNavigation();update();
    nav.addEventListener('click',event=>{if(event.target.closest('.pve-mode-btn')&&!event.target.closest('[data-v3-cow-entry]'))globalThis.CowRoomLive?.hide();},true);
    if(requestedCow){requestedCow=false;const url=new URL(location.href),enter=url.searchParams.get('enter')==='1';url.searchParams.delete('pve');url.searchParams.delete('enter');history.replaceState(history.state,'',url);void globalThis.PveV3Runtime.tryOpen('cow-room',{enter});}
    if(value.enabled===true){const mercenary=document.createElement('a');mercenary.className='pve-mode-btn';mercenary.href='/mercenary-hangar/';mercenary.textContent='용병 지휘소';nav.append(mercenary);}
  };
  add();const observer=new MutationObserver(add);observer.observe(document.body,{childList:true,subtree:true});
  addEventListener('pagehide',()=>observer.disconnect(),{once:true});
});
