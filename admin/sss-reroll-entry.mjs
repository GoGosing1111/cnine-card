function install(){
 const nav=document.getElementById('nav'),view=document.getElementById('view-dashboard');if(!nav||!view)return;
 const button=document.createElement('button');button.type='button';button.id='sss-reroll-cms-entry';button.textContent='SSS 재뽑기 관리';button.hidden=true;button.onclick=()=>location.assign('/admin/sss-reroll.html');nav.append(button);
 const panel=document.createElement('section');panel.className='panel';panel.hidden=true;panel.style.cssText='border:1px solid #8a7953;background:linear-gradient(110deg,#122632,#101923);padding:22px;display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-bottom:20px';
 panel.innerHTML='<img src="/assets/ui/sss-reroll-v1/ticket-256.webp" alt="" style="width:85px;height:85px;object-fit:contain"><div style="flex:1"><h2 style="margin:0 0 9px">SSS 재뽑기</h2><p style="margin:0;color:#a4bac5">일반 SSS 1장 + 재뽑기권 1개 · 용병별 확률 독립 관리</p></div><a href="/admin/sss-reroll.html" style="background:#dbc18a;color:#18232d;padding:13px 20px;font-weight:800;text-decoration:none">SSS 재뽑기 관리 ↗</a>';
 view.prepend(panel);const sync=event=>{const owner=(event?.detail||globalThis.__SOOP_CMS_IDENTITY__)?.role==='OWNER';button.hidden=!owner;panel.hidden=!owner;};window.addEventListener('soop:cms-identity',sync);sync();
 const add=()=>{const select=document.getElementById('inventoryItemCode');if(select&&!select.querySelector('[value="MERCENARY_SSS_REROLL_TICKET"]')){const option=document.createElement('option');option.value='MERCENARY_SSS_REROLL_TICKET';option.textContent='SSS 재뽑기권 · 일반 SSS 1장 교체';select.append(option);}};
 const dialog=document.getElementById('userDialog');if(dialog)new MutationObserver(add).observe(dialog,{childList:true,subtree:true});add();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
