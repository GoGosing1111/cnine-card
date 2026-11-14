const files=['01-front','02-champions','03-regular-season','04-players','05-club-reviews','06-legacy'];
let current=1;
const params=new URLSearchParams(location.search);
if(params.has('proof'))document.body.classList.add('proof');
function show(n,scroll=true){
  current=Math.max(1,Math.min(6,Number(n)||1));
  document.querySelectorAll('.paper').forEach(p=>{
    p.hidden=Number(p.dataset.page)!==current;
    if(!p.hidden)p.querySelectorAll('img[loading="lazy"]').forEach(im=>im.loading='eager');
  });
  document.getElementById('page-select').value=current;
  document.getElementById('prev').disabled=current===1;
  document.getElementById('next').disabled=current===6;
  document.getElementById('download').href='pages/'+files[current-1]+'.png';
  history.replaceState(null,'','#'+current);
  if(scroll)window.scrollTo(0,0);
}
document.getElementById('prev').onclick=()=>show(current-1);
document.getElementById('next').onclick=()=>show(current+1);
document.getElementById('page-select').onchange=e=>show(e.target.value);
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='ArrowRight')show(current+1);if(e.key==='ArrowLeft')show(current-1)});
window.showNewsPage=show;
show(params.get('page')||location.hash.slice(1)||1,false);
