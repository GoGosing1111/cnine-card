import {jointAccountRequest} from './joint-account-transport.mjs';
let pending=false;
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-legion-hunt-entry]');if(!button||pending)return;
  event.preventDefault();pending=true;button.disabled=true;
  try{
    await jointAccountRequest('legion-hunt/bootstrap');
    const dialog=document.createElement('dialog');dialog.className='legion-hunt-portal';
    dialog.innerHTML='<header><strong>군단토벌 <small>잊혀진 섬 · OWNER</small></strong><button type="button" aria-label="군단토벌 닫기">PVE로 돌아가기</button></header><iframe title="군단토벌 · 잊혀진 섬" src="/preview/sustained-hunt-v2/?owner=1" allow="autoplay; fullscreen"></iframe>';
    document.body.append(dialog);dialog.showModal();
    const close=()=>{dialog.querySelector('iframe').src='about:blank';dialog.remove();button.focus();};
    dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  }catch(error){if(typeof window.toast==='function')window.toast(error.message);else window.alert(error.message);}
  finally{pending=false;button.disabled=false;}
});
