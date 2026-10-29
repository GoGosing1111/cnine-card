/* Mercenary contract engraving. Presents an already committed workshop receipt;
 * gestures, animation, skipping and closing never perform a transaction. */
(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:2});
  const url=v=>{try{const u=new URL(String(v||''),location.origin+'/');return v&&/^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
  let active=null;
  const assets='/assets/ui/workshop/mercenary-atelier-20261025/';
  function play({data,recipe,isActive=()=>true}={}){
    if(data?.ok!==true||data.category!=='MERCENARY_CRAFT'||!data.requestId||typeof data.success!=='boolean'||(data.success&&!data.output)||!isActive())return Promise.resolve(false);
    active?.();
    return new Promise(resolve=>{
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const success=data.success,name=data.output?.name||recipe?.output_name||data.recipeName||'용병';
      const art=url(data.output?.image||recipe?.output_image);
      const material=recipe?.materials?.[0],shard=url(material?.image_url)||'/assets/items/mercenary-sss-card-shard-v1.png';
      const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
      const root=document.createElement('div');root.className='mc-reveal';root.dataset.phase='charging';root.dataset.motion=reduced?'reduced':'full';
      root.innerHTML=`<section class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-title" tabindex="-1">
        <div class="mc-backdrop" aria-hidden="true"><div class="mc-environment"></div><div class="mc-vignette"></div></div><div class="mc-flash" aria-hidden="true"></div>
        <header class="mc-header"><div><small>MERCENARY FORGING</small><span>용병 제작 <i>/</i> ${esc(name)}</span></div><button class="mc-skip" type="button">바로 결과 보기 <span aria-hidden="true">↗</span></button></header>
        <div class="mc-heading"><p data-eyebrow>THE SOUL ATELIER</p><h2 id="mc-title">영혼의 주조실</h2><p data-caption aria-live="polite">흩어진 조각에, 새로운 의지를 새기다.</p></div>
        <div class="mc-scene" aria-hidden="true"><canvas></canvas><div class="mc-beam"></div><div class="mc-halo"></div><div class="mc-floorlight"></div>
          <div class="mc-fragments">${Array.from({length:8},(_,i)=>`<img src="${esc(shard)}" alt="" draggable="false" style="--i:${i};--x:${Math.cos(i*Math.PI/4)*180}px;--y:${Math.sin(i*Math.PI/4)*170}px">`).join('')}</div>
          <div class="mc-contract"><img class="mc-relic-whole" src="${assets}relic.webp" alt="" draggable="false"><div class="mc-relic-pieces">${['left','right','crown','core','base'].map(part=>`<img class="mc-piece mc-piece-${part}" src="${assets}relic.webp" alt="" draggable="false">`).join('')}</div><div class="mc-core-light"></div></div>
          <figure class="mc-art" hidden><img alt=""><figcaption>SSS <span>LIMITED</span></figcaption></figure><div class="mc-broken" hidden><span>결속 소멸</span><small>CONTRACT LOST</small></div>
          <span class="mc-scene-label">SSS <i></i> LIMITED</span>
        </div>
        <div class="mc-controls"><div class="mc-unseal"><div class="mc-charge-label"><span data-instruction>조각의 힘을 결속하는 중</span><b data-charge>0<small>%</small></b></div><div class="mc-track"><span data-track-label>봉인에 힘을 모으는 중</span><div class="mc-track-fill"></div><button type="button" class="mc-handle" role="slider" aria-label="오른쪽으로 밀어 용병 제작 결과 확인" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-describedby="mc-hint" disabled><svg class="mc-gem" viewBox="145 224 133 258" aria-hidden="true" focusable="false"><defs><clipPath id="mc-gem-cut"><path d="M211.5 224 278 353 211.5 482 145 353Z"/></clipPath></defs><image href="${assets}action.webp" width="2172" height="724" clip-path="url(#mc-gem-cut)"/></svg></button></div><p id="mc-hint">개방 조작은 제작 확률에 영향을 주지 않습니다.</p></div>
          <div class="mc-result" hidden aria-live="polite"><div><p data-result-name></p><p data-result-note></p><small data-spent></small></div><button class="mc-done" type="button">확인</button></div>
        </div>
        <footer class="mc-footer"><ol aria-label="제작 연출 단계"><li data-step="charging">01 결속</li><li data-step="sealed">02 개방</li><li data-step="result">03 결과</li></ol><button class="mc-sound" type="button" aria-pressed="false">소리 OFF</button></footer>
      </section>`;
      document.body.append(root);document.body.style.overflow='hidden';
      const inert=[...document.body.children].filter(n=>n!==root&&n instanceof HTMLElement).map(n=>[n,n.inert]);inert.forEach(([n])=>n.inert=true);
      const $=s=>root.querySelector(s),dialog=$('.mc-dialog'),handle=$('.mc-handle'),track=$('.mc-track');
      let closed=false,phase='charging',charge=0,drag=null,raf=0,poll=0,audio=null,sound=false,openedAt=0,resultAt=0,lastFrame=0;
      try{sound=localStorage.getItem('cnine_battle_sound')==='ON';}catch{}
      const timers=new Set(),listeners=[];
      const on=(n,event,fn,opts)=>{n.addEventListener(event,fn,opts);listeners.push(()=>n.removeEventListener(event,fn,opts));};
      const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(!closed)fn();},ms);timers.add(id);return id;};
      const valid=()=>!closed&&root.isConnected&&isActive();
      function finish(){
        if(closed)return;closed=true;timers.forEach(clearTimeout);clearInterval(poll);cancelAnimationFrame(raf);listeners.forEach(fn=>fn());audio?.close().catch(()=>{});
        root.remove();inert.forEach(([n,value])=>{if(n.isConnected)n.inert=value;});document.body.style.overflow=previousOverflow;
        if(active===finish)active=null;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve(true);
      }
      active=finish;
      function unlockAudio(){if(!sound)return;try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
      function tone(kind){
        if(!sound||!audio)return;
        try{const t=audio.currentTime,notes=kind==='open'?[110,165,220]:success?[261.63,392,523.25,783.99]:[130,98,65];
          notes.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),start=t+i*.08;o.type='sine';o.frequency.setValueAtTime(hz,start);o.frequency.exponentialRampToValueAtTime(hz*(kind==='result'&&!success ? 0.8 : 1.05),start+.8);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(.025,start+.025);g.gain.exponentialRampToValueAtTime(.0001,start+1.1);o.connect(g);g.connect(audio.destination);o.start(start);o.stop(start+1.2);});
        }catch{}
      }
      function soundLabel(){$('.mc-sound').textContent='소리 '+(sound?'ON':'OFF');$('.mc-sound').setAttribute('aria-pressed',String(sound));}
      function setPhase(next){phase=next;root.dataset.phase=next;root.querySelectorAll('[data-step]').forEach(n=>n.setAttribute('aria-current',n.dataset.step===(next==='opening'?'sealed':next)?'step':'false'));}
      const slideTravel=()=>Math.max(0,track.clientWidth-2*(handle.offsetLeft+handle.offsetWidth/2));
      function setCharge(value){
        charge=Math.max(0,Math.min(1,value));const percent=Math.round(charge*100);
        root.style.setProperty('--mc-charge',charge);handle.style.transform=`translateX(${charge*slideTravel()}px)`;
        handle.setAttribute('aria-valuenow',String(percent));handle.setAttribute('aria-valuetext',`${percent}%, 끝까지 밀어 결과 확인`);$('[data-charge]').innerHTML=`${percent}<small>%</small>`;
      }
      function ready(){
        if(!valid()){finish();return;}if(phase!=='charging')return;setPhase('sealed');handle.disabled=false;setCharge(0);
        $('[data-eyebrow]').textContent='THE SOUL ATELIER';$('#mc-title').textContent='영혼의 주조실';$('[data-caption]').textContent='봉인된 힘이, 당신의 손길을 기다립니다.';
        $('[data-instruction]').textContent='결속 완료 · 봉인 개방 준비';$('[data-track-label]').textContent='밀어서 봉인 개방';
      }
      function showResult(){
        if(!valid()){finish();return;}if(phase==='result')return;setPhase('result');resultAt=performance.now();stopDrag();root.dataset.outcome=success?'success':'failure';
        $('.mc-unseal').hidden=true;$('.mc-result').hidden=false;$('.mc-skip').hidden=true;
        $('[data-eyebrow]').textContent=success?'A NEW OATH IS BORN':'THE OATH HAS FALLEN';$('#mc-title').textContent=success?'용병 제작 성공':'용병 제작 실패';
        $('[data-caption]').textContent=success?'봉인 너머, 새로운 동료가 응답했습니다.':'조각의 힘이 흩어져 각인을 완성하지 못했습니다.';
        $('[data-result-name]').textContent=success?`${name} ${Number(data.output.quantity||1)}장 획득`:`${name} · 획득 없음`;
         $('[data-result-note]').textContent=(success?'완성된 용병이 보관함에 지급되었습니다.':'투입한 제작 재료와 재화는 소모되었습니다.')+(data.awakenedOmegaCraft?` 실패 누적 ${data.pity.failures} / 10회 · ${data.pity.guaranteed?'다음 제작 100% 성공':success?'누적 초기화':'재접속 후에도 유지'}`:'');
        const costs=[];if(Number(data.coinSpent)>0)costs.push(`코인 ${fmt.format(data.coinSpent)}`);if(Number(data.masterStarSpent)>0)costs.push(`마스터의 별 ${fmt.format(data.masterStarSpent)}개`);if(Number(data.cardShardSpent)>0)costs.push(`카드 조각 ${fmt.format(data.cardShardSpent)}개`);
        $('[data-spent]').textContent=costs.length?`소모 · ${costs.join(' / ')}`:'';
        $('.mc-scene-label').textContent=success?'SSS LIMITED · 영혼의 각인':'결속된 힘이 흩어졌습니다';
        if(success){$('.mc-art').hidden=false;const img=$('.mc-art img');img.alt=name;img.onerror=()=>{img.hidden=true;root.classList.add('mc-art-unavailable');};if(art)img.src=art;else img.onerror();}
        else $('.mc-broken').hidden=false;
        tone('result');$('.mc-done').focus({preventScroll:true});
        later(()=>{cancelAnimationFrame(raf);ctx?.clearRect(0,0,canvas.width,canvas.height);root.classList.add('mc-settled');},3200);
      }
      function reveal(immediate=false){
        if(!valid()){finish();return;}if(phase==='result')return;
        unlockAudio();if(immediate||reduced){showResult();return;}if(phase!=='sealed')return;
        setCharge(1);stopDrag();handle.disabled=true;setPhase('opening');openedAt=performance.now();tone('open');
        $('[data-caption]').textContent='봉인이 깨어집니다.';$('[data-track-label]').textContent='각인 확인 중';later(showResult,1650);
      }
      function stopDrag(reset=false){
        const pointerId=drag?.id;drag=null;root.classList.remove('mc-dragging');
        if(pointerId!=null&&track.hasPointerCapture(pointerId))track.releasePointerCapture(pointerId);
        if(reset&&phase==='sealed')setCharge(0);
      }
      // The whole rail is the gesture target. A short intentional swipe opens it;
      // the remaining room near the right edge bounds the required distance.
      on(track,'pointerdown',e=>{
        if(phase!=='sealed'||drag||e.isPrimary===false||e.button!==0)return;
        e.preventDefault();unlockAudio();handle.focus({preventScroll:true});
        const box=track.getBoundingClientRect(),travel=slideTravel();
        const distance=Math.min(120,Math.max(72,travel*.45),Math.max(16,box.right-e.clientX-12));
        drag={id:e.pointerId,start:e.clientX,initial:charge,distance};
        track.setPointerCapture(e.pointerId);root.classList.add('mc-dragging');
      });
      on(track,'pointermove',e=>{
        if(!drag||e.pointerId!==drag.id||phase!=='sealed')return;e.preventDefault();
        setCharge(drag.initial+(e.clientX-drag.start)/drag.distance*(1-drag.initial));
        if(charge>=.96)reveal();
      });
      const release=e=>{if(drag&&e.pointerId===drag.id)stopDrag(true);};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])on(track,event,release);
      on(window,'blur',()=>stopDrag(true));
      on(handle,'keydown',e=>{if(phase!=='sealed'||!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();unlockAudio();if(['End','Enter',' '].includes(e.key))reveal();else setCharge(e.key==='Home'?0:charge+(['ArrowLeft','ArrowDown'].includes(e.key)?-.1:.1));if(charge>=.96)reveal();});
      on($('.mc-skip'),'click',()=>reveal(true));on($('.mc-done'),'click',finish);
      on($('.mc-sound'),'click',()=>{sound=!sound;unlockAudio();soundLabel();});
      on(root,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();phase==='result'?finish():reveal(true);}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled)')].filter(n=>!n.hidden&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
      on(window,'resize',()=>{if(phase==='sealed')setCharge(charge);resize();});
      on(window,'pagehide',finish);
      poll=setInterval(()=>{if(!valid())finish();},200);
      const canvas=$('canvas'),ctx=canvas.getContext('2d');let width=1,height=1;
      function resize(){const box=$('.mc-scene').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=box.width;height=box.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);}
      resize();const particles=Array.from({length:160},(_,i)=>({angle:i*2.39996,radius:.25+(i%17)/20,speed:.25+(i%11)*.08,size:1+(i%3)*.6}));
      function frame(now){
        if(!valid()){finish();return;}raf=requestAnimationFrame(frame);if(now-lastFrame<32)return;lastFrame=now;ctx.clearRect(0,0,width,height);
        const cx=width/2,cy=height/2,r=Math.min(width,height)*.48,age=resultAt?(now-resultAt)/1000:0;
        if(phase==='charging'){const p=Math.min(1,(now-startedAt)/1750);root.style.setProperty('--mc-energy',p);$('[data-charge]').innerHTML=`${Math.round(p*100)}<small>%</small>`;}
        ctx.globalCompositeOperation='lighter';
        for(const p of particles){const a=p.angle+now*.00016*p.speed,spread=phase==='charging'?Math.max(.1,1-(now-startedAt)/2100):phase==='opening'?1+(now-openedAt)/550:1+charge*.3;
          let x=cx+Math.cos(a)*r*p.radius*spread,y=cy+Math.sin(a)*r*p.radius*spread;
          if(phase==='result'){if(success){x=cx+Math.cos(a)*r*(.15+age*p.speed);y=cy+Math.sin(a)*r*(.15+age*p.speed)-age*10;}else{y=cy+Math.sin(a)*r*p.radius+age*age*65;x+=Math.sin(p.angle)*age*30;}}
          ctx.globalAlpha=phase==='result'?Math.max(0,1-age/3.2)*.8:.25+charge*.45;ctx.strokeStyle=phase==='result'&&!success?'#a99783':p.size>2?'#b0dfff':'#f3d79d';ctx.lineWidth=p.size*.65;
          const length=phase==='opening'?12:phase==='result'?(success?9:5):2+charge*6;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*length,y-(phase==='result'&&!success?-length:Math.sin(a)*length));ctx.stroke();
        }
        if(phase==='opening'||phase==='result'&&success){const t=phase==='opening'?(now-openedAt)/1650:age/3.2,range=r*(.3+t*1.8);ctx.globalAlpha=Math.max(0,.3*(1-t));ctx.strokeStyle='#fbe8bd';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(cx,cy,range,range*.35,0,0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      }
      const startedAt=performance.now();if(ctx&&!reduced)raf=requestAnimationFrame(frame);
      soundLabel();setPhase('charging');dialog.focus({preventScroll:true});later(ready,reduced?0:1950);
    });
  }
  window.MercenaryCraftReveal=Object.freeze({play,cancel:()=>active?.()});
})();
