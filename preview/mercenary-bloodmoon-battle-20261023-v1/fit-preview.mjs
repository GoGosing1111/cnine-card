import {preferredFrameHeight} from '../project-v-v3/source/battle/ViewportLayout.mjs';
// Same V3 fit calculation, including the reserved SSS dialogue above the canvas.
const frame=window.frameElement;
if(frame){
 const viewport=frame.parentElement,initialHeight=viewport.style.height;let shell,raf,owned=false,disposed=false;
 const fit=()=>{
  if(disposed||!shell?.isConnected)return;
  const header=shell.querySelector('.battle-v3-header')?.getBoundingClientRect(),dock=shell.querySelector('.battle-v3-dock')?.getBoundingClientRect(),canvasHost=shell.querySelector('.battle-v3-canvas-host'),host=canvasHost?.getBoundingClientRect();
  if(!header?.height||!dock?.height||!host)return;
  if(parent.document.fullscreenElement?.contains(frame)){if(owned)viewport.style.height=initialHeight;return;}
  const status=shell.querySelector('.battle-v3-status'),statusVisible=status&&getComputedStyle(status).display!=='none',atDock=statusVisible&&shell.classList.contains('is-roster-visible');
  const notice=statusVisible&&!atDock?Math.max(0,status.getBoundingClientRect().bottom-host.top):8;
  const reservedTop=Math.max(header.height,host.top-shell.getBoundingClientRect().top);
  const height=preferredFrameHeight({width:frame.clientWidth,header:reservedTop,dock:dock.height+(atDock?status.getBoundingClientRect().height:0),notice:notice+Number(canvasHost.dataset.v3FormationExtraTop||0)});
  if(height){owned=true;viewport.style.height=height+'px';}else if(owned){viewport.style.height=initialHeight;owned=false;}
 };
 const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(fit);},sizes=new ResizeObserver(schedule);
 const bind=()=>{const next=document.querySelector('.battle-v3-live-shell');if(next!==shell){shell=next;sizes.disconnect();if(shell)for(const node of [frame,...shell.querySelectorAll('.battle-v3-header,.battle-v3-dock,.battle-v3-status')])sizes.observe(node);}schedule();};
 const mounts=new MutationObserver(bind);mounts.observe(document.body,{childList:true,subtree:true});
 parent.document.addEventListener('fullscreenchange',schedule);window.addEventListener('resize',schedule);document.addEventListener('v3-formation-resize',schedule);
 window.addEventListener('pagehide',()=>{disposed=true;mounts.disconnect();sizes.disconnect();cancelAnimationFrame(raf);parent.document.removeEventListener('fullscreenchange',schedule);},{once:true});bind();
}
