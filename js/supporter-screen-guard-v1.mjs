// Best-effort browser deterrence only; OS screenshots and external recording
// cannot be reliably detected or prevented by a web page.
export function protectedScreenShortcut(event){
  const key=String(event.key||'').toLowerCase(),code=String(event.code||'');
  if(key==='printscreen'||key==='snapshot'||code==='PrintScreen')return 'capture';
  if(event.metaKey&&event.shiftKey&&(['3','4','5'].includes(key)||['Digit3','Digit4','Digit5'].includes(code)))return 'capture';
  if(event.metaKey&&event.shiftKey&&(key==='s'||code==='KeyS'))return 'capture';
  if(event.ctrlKey||event.metaKey){if(key==='p'||code==='KeyP')return 'print';if(key==='s'||code==='KeyS')return 'save';}
  return null;
}

export function mountSupportScreenGuard(dialog,{getUser=()=>({}),now=Date.now}={}){
  const doc=dialog.ownerDocument,win=doc.defaultView,lifecycle=new AbortController();
  let disposed=false,covered=false,cover=null,previousFocus=null;
  const active=()=>!disposed&&dialog.isConnected&&dialog.open;
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{capture:true,signal:lifecycle.signal});
  const focusResume=()=>{if(active()&&covered&&!doc.hidden&&doc.hasFocus())cover?.querySelector('[data-ss-resume]')?.focus({preventScroll:true});};
  function conceal(){
    if(!active())return;
    if(!covered){const focused=dialog.getRootNode().activeElement;if(focused&&dialog.contains(focused))previousFocus=focused;}
    covered=true;dialog.setAttribute('data-ss-covered','');focusResume();
  }
  function resume(){
    if(!active()||doc.hidden)return;
    covered=false;dialog.removeAttribute('data-ss-covered');
    const target=previousFocus?.isConnected&&dialog.contains(previousFocus)?previousFocus:dialog.querySelector('[data-ss-close]');
    target?.focus({preventScroll:true});previousFocus=null;
  }
  function refresh(){
    if(disposed)return;
    dialog.setAttribute('data-ss-protected','');
    if(!cover?.isConnected){
      cover=doc.createElement('section');cover.className='ss-capture-cover';cover.setAttribute('aria-label','화면 보호');
      cover.innerHTML='<div class="ss-capture-panel"><img src="/assets/ui/season-pass-v1/supporter-crest.webp" width="68" height="68" alt=""><small>시즌패스 · 서버 후원</small><h3>화면 보호 중</h3><p class="ss-capture-screen-copy">이 창으로 돌아온 뒤<br>계속 보기를 눌러 주세요.</p><p class="ss-capture-print-copy">이 화면은 인쇄할 수 없습니다.</p><div class="ss-capture-actions"><button type="button" data-ss-resume>계속 보기</button><button type="button" data-ss-close>닫기</button></div></div>';
      cover.querySelector('[data-ss-resume]').addEventListener('click',resume);dialog.append(cover);
    }
    const user=getUser(),id=Number(user?.serverUserId||user?.id),viewer=Number.isSafeInteger(id)&&id>0?'#'+id:'VIEWER';
    const stamp=new Date(now()).toLocaleString('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><g transform="rotate(-18 160 90)" fill="#dbe8f3" opacity=".12" font-family="Arial,sans-serif" font-size="12" text-anchor="middle"><text x="160" y="82">SOOPKETMON · '+viewer+'</text><text x="160" y="101">'+stamp+' KST</text></g></svg>';
    dialog.style.setProperty('--ss-viewer-watermark',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    dialog.toggleAttribute('data-ss-covered',covered);
    if(active()&&(doc.hidden||!doc.hasFocus()))conceal();
  }
  const block=event=>{if(active()){event.preventDefault();event.stopImmediatePropagation();}};
  for(const type of ['copy','cut','contextmenu','dragstart','selectstart'])listen(win,type,block);
  for(const type of ['keydown','keyup'])listen(win,type,event=>{
    if(!active())return;const kind=protectedScreenShortcut(event);
    if(kind&&(type==='keydown'||kind==='capture')){block(event);conceal();}
  });
  listen(win,'blur',event=>{if(event.target===win)conceal();});
  listen(doc,'visibilitychange',()=>{if(doc.hidden)conceal();});
  listen(win,'pagehide',conceal);listen(win,'beforeprint',conceal);listen(win,'focus',event=>{if(event.target===win)focusResume();});
  refresh();
  return {refresh,dispose(){
    if(disposed)return;disposed=true;lifecycle.abort();cover?.remove();previousFocus=null;
    dialog.removeAttribute('data-ss-protected');dialog.removeAttribute('data-ss-covered');dialog.style.removeProperty('--ss-viewer-watermark');
  }};
}
