function install(){
 const view=document.getElementById('view-dashboard'),nav=document.getElementById('nav');if(!view||!nav)return;
 const button=document.createElement('button');button.type='button';button.id='sss-miracle-cube-cms-entry';button.textContent='SSS 미라클큐브';button.hidden=true;button.onclick=()=>location.assign('/admin/sss-miracle-cube.html');nav.append(button);
 const panel=document.createElement('section');panel.hidden=true;panel.style.cssText="border:16px solid transparent;border-image:url('/assets/ui/sss-miracle-cube-20261021/panel.webp') 150 fill / 24px stretch;padding:14px 20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:20px";
 panel.innerHTML='<img src="/assets/ui/sss-miracle-cube-20261021/cube-320.webp" alt="" style="width:90px;height:90px;object-fit:contain"><div style="flex:1;min-width:180px"><h2 style="margin:0 0 9px">SSS 미라클큐브</h2><p style="margin:0;color:#b7adc9">SSS 일반 · SSS 리미티드 / 개별 확률 · 기존 한정 수량 연동</p></div><a href="/admin/sss-miracle-cube.html" style="color:#f7dba2;padding:12px;font-weight:700">전용 CMS 관리 ↗</a>';
 view.prepend(panel);
 const sync=event=>{const owner=(event?.detail||globalThis.__SOOP_CMS_IDENTITY__)?.role==='OWNER';button.hidden=!owner;panel.hidden=!owner;panel.style.display=owner?'flex':'none';};window.addEventListener('soop:cms-identity',sync);sync();
 const add=()=>{const select=document.getElementById('inventoryItemCode');if(select&&!select.querySelector('[value="SSS_MIRACLE_CUBE"]')){const option=document.createElement('option');option.value='SSS_MIRACLE_CUBE';option.textContent='SSS 미라클큐브 · SSS 일반/리미티드';select.append(option);}};
 const dialog=document.getElementById('userDialog');if(dialog)new MutationObserver(add).observe(dialog,{childList:true,subtree:true});add();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
