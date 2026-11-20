export function mountPveV3Cms(host){
  host.classList.add('pve-v3-cms');
  const title=document.createElement('h2'),note=document.createElement('p'),links=document.createElement('nav');
  title.textContent='원정 설정';
  note.textContent='무한의탑 층별 보상과 진행 정책은 탑 CMS에서 관리합니다. 카우방은 개인·파티 군단토벌에서 입장합니다.';
  for(const [label,url] of [['무한의탑 CMS','/admin/#tower'],['무한의탑 입장','/?screen=battle&pve=tower']]){
    const link=document.createElement('a');link.textContent=label;link.href=url;links.append(link,document.createTextNode(' '));
  }
  host.replaceChildren(title,note,links);
}
function install(){const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='V3 원정';button.dataset.view='pve-v3';button.hidden=true;panel.id='view-pve-v3';panel.className='view';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
  button.addEventListener('click',e=>{e.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='V3 원정';history.replaceState(null,'','#pve-v3');if(!mounted){mounted=true;void mountPveV3Cms(panel);}},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
