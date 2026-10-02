function install(){
 const view=document.getElementById('view-dashboard'),nav=document.getElementById('nav');if(!view||!nav)return;
 const button=document.createElement('button');button.type='button';button.id='miracle-cube-cms-entry';button.textContent='미라클 큐브 관리';button.hidden=true;button.onclick=()=>location.assign('/admin/miracle-cube.html');nav.append(button);
 const panel=document.createElement('section');panel.className='panel';panel.style.cssText='border:1px solid #566c48;background:linear-gradient(110deg,#142134,#101621);padding:22px;display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-bottom:20px';
 panel.innerHTML='<img src="/assets/ui/miracle-cube-v1/cube-closed.webp" alt="" style="width:85px;height:85px;object-fit:contain"><div style="flex:1"><h2 style="margin:0 0 9px">미라클 큐브</h2><p style="margin:0;color:#a4b4cc">최상위 용병 큐브 · 등급 확률 / 용병별 확률 독립 관리</p></div><a href="/admin/miracle-cube.html" style="background:#c8ff6b;color:#122009;padding:13px 20px;font-weight:800;text-decoration:none">미라클 큐브 관리 ↗</a>';
 panel.hidden=true;view.prepend(panel);
 const sync=event=>{const owner=(event?.detail||globalThis.__SOOP_CMS_IDENTITY__)?.role==='OWNER';button.hidden=!owner;panel.hidden=!owner;};window.addEventListener('soop:cms-identity',sync);sync();
 const add=()=>{const select=document.getElementById('inventoryItemCode');if(select&&!select.querySelector('[value="MIRACLE_CUBE"]')){const option=document.createElement('option');option.value='MIRACLE_CUBE';option.textContent='미라클 큐브 · 용병 C~SSS';select.append(option);}};
 const dialog=document.getElementById('userDialog');if(dialog)new MutationObserver(add).observe(dialog,{childList:true,subtree:true});add();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
