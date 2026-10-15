const $=id=>document.getElementById(id);
let finished=false;
const finish=accepted=>{
  if(finished)return;finished=true;
  for(const button of document.querySelectorAll('button'))button.disabled=true;
  window.soopDialog.finish(accepted,$('dialogInput').value);
};
$('close').addEventListener('click',()=>finish(false));
$('cancel').addEventListener('click',()=>finish(false));
$('accept').addEventListener('click',()=>finish(true));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.isComposing){event.preventDefault();finish(false);}
  if(event.key==='Enter'&&event.target===$('dialogInput')&&!event.isComposing){event.preventDefault();finish(true);}
  if(event.key==='Tab'){
    const focusable=[...document.querySelectorAll('button:not([disabled]),input,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
window.addEventListener('wheel',event=>{if(event.ctrlKey)event.preventDefault();},{passive:false});
void window.soopDialog.data().then(async request=>{
  const prompt=request.kind==='prompt',alert=request.kind==='alert';
  document.body.dataset.kind=request.kind;
  $('dialogLabel').textContent=prompt?'내용 입력':alert?'알림':'진행 확인';
  $('dialogTitle').textContent=request.title||(prompt?'내용을 입력해 주세요':alert?'알려드립니다':'확인해 주세요');
  $('dialogMessage').textContent=request.message;
  $('inputLabel').hidden=!prompt;$('cancel').hidden=alert;
  $('accept').textContent=request.acceptLabel||'확인';
  if(prompt)$('dialogInput').value=request.defaultValue;
  await document.fonts.ready;
  // Measure the un-clipped message before fixing the window size; long messages scroll.
  const scroll=document.querySelector('.message-scroll');
  $('dialog').style.minHeight='0';scroll.style.maxHeight='300px';
  const height=Math.ceil($('dialog').getBoundingClientRect().height);
  $('dialog').style.minHeight='';scroll.style.maxHeight='';
  window.soopDialog.ready(height);
  const focus=prompt?$('dialogInput'):alert?$('accept'):$('cancel');
  focus.focus();if(prompt)focus.select();
}).catch(()=>finish(false));
