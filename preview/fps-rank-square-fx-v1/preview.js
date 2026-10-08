(async function(){
  'use strict';
  await RankFX.init('assets/rank-chart-square-source-v3.png');
  const holder=document.getElementById('ranks'),chart=document.getElementById('chart'),comparison=document.getElementById('comparison');
  chart.getContext('2d',{willReadFrequently:true});
  const views=RankFX.ranks.map((r,i)=>{
    const section=document.createElement('article');section.className='rank';
    const c=document.createElement('canvas');c.width=c.height=256;c.setAttribute('aria-label',`${r.name} 반복 이펙트`);
    const title=document.createElement('h2');title.textContent=r.name;
    const description=document.createElement('p');description.textContent=r.description;
    section.append(c,title,description);holder.append(section);return {canvas:c,ctx:c.getContext('2d'),index:i,visible:true};
  });
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=reduce.matches,enabled=true,time=0,last=performance.now(),manual=false,chartVisible=true;
  const pause=document.getElementById('pause'),effects=document.getElementById('effects'),status=document.getElementById('status');
  function controls(){pause.textContent=paused?'재생':'일시정지';pause.setAttribute('aria-pressed',String(paused));effects.textContent=enabled?'이펙트 ON':'이펙트 OFF';effects.setAttribute('aria-pressed',String(enabled));status.textContent=reduce.matches&&paused?'동작 줄이기 설정에 따라 정지 화면으로 표시합니다. 재생 버튼으로 확인할 수 있습니다.':'';}
  function render(t,force=false){
    views.forEach(v=>{if(force||v.visible)RankFX.drawIcon(v.ctx,v.index,t,256,enabled);});
    if(force||chartVisible)RankFX.drawChart(chart.getContext('2d'),t,enabled);
    if(force)RankFX.drawComparison(comparison.getContext('2d'),t,1020,690,enabled);
  }
  pause.addEventListener('click',()=>{paused=!paused;last=performance.now();controls();render(time,true);});
  effects.addEventListener('click',()=>{enabled=!enabled;controls();render(time,true);});
  reduce.addEventListener('change',()=>{if(reduce.matches)paused=true;controls();render(time,true);});
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.target===chart)chartVisible=entry.isIntersecting;else{const v=views.find(v=>v.canvas===entry.target);if(v)v.visible=entry.isIntersecting;}}),{rootMargin:'100px'});
  views.forEach(v=>observer.observe(v.canvas));observer.observe(chart);
  let lastPaint=0;
  function tick(now){const delta=Math.min(100,now-last);last=now;if(!paused&&!manual&&!document.hidden){time=(time+delta/1000)%RankFX.LOOP;if(now-lastPaint>1000/30){render(time);lastPaint=now;}}requestAnimationFrame(tick);}
  document.addEventListener('visibilitychange',()=>{last=performance.now();});
  controls();render(0,true);requestAnimationFrame(tick);
  window.rankPreview={ready:true,ranks:RankFX.ranks,loopSeconds:RankFX.LOOP,render(t,on=true){manual=true;enabled=on;time=t;render(t,true);},resume(){manual=false;paused=false;last=performance.now();controls();},getCanvases(){return {chart,comparison,icons:views.map(v=>v.canvas)};}};
})();
