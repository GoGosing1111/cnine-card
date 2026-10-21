// Move the battlefield out of the nested headquarters iframe into its own viewport.
export function openOrganizationFaction({roundId,tab='map',onClose}={}){
  let host=window;
  try{while(host.parent!==host&&host.parent.location.origin===location.origin)host=host.parent;}catch{}
  const doc=host.document,existing=doc.querySelector('[data-organization-war-window]');
  if(existing){existing.focus();return;}
  const previous=doc.activeElement,overflow=doc.documentElement.style.overflow;
  const dialog=doc.createElement('dialog');dialog.dataset.organizationWarWindow='';dialog.setAttribute('aria-label','조직 세력전 전용 화면');
  Object.assign(dialog.style,{position:'fixed',inset:'0',width:'100vw',height:'100dvh',maxWidth:'none',maxHeight:'none',margin:'0',padding:'0',border:'0',background:'#080e11',overflow:'hidden'});
  const frame=doc.createElement('iframe');frame.title='조직 세력전 전용 화면';
  const url=new URL('/organization/faction/',location.origin);url.searchParams.set('window','1');url.searchParams.set('v','20261021-command');if(roundId)url.searchParams.set('roundId',String(roundId));if(['map','formation','treasury','log'].includes(tab))url.searchParams.set('tab',tab);frame.src=url.href;
  Object.assign(frame.style,{width:'100%',height:'100%',display:'block',border:'0'});
  const close=()=>{dialog.close();dialog.remove();doc.documentElement.style.overflow=overflow;host.removeEventListener('message',receive);window.removeEventListener('pagehide',close);previous?.focus({preventScroll:true});onClose?.();};
  const receive=event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='organization:faction:close')close();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!frame.contentDocument?.querySelector('[data-fw-leave]')){close();return;}frame.contentWindow?.postMessage({type:'organization:faction:escape'},location.origin);});
  host.addEventListener('message',receive);window.addEventListener('pagehide',close,{once:true});
  dialog.append(frame);doc.body.append(dialog);doc.documentElement.style.overflow='hidden';dialog.showModal();frame.focus();
  return close;
}
