/* Mercenary contract engraving. Presents an already committed workshop receipt;
 * gestures, animation, skipping and closing never perform a transaction. */
(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:2});
  const url=v=>{try{const u=new URL(String(v||''),location.origin+'/');return v&&/^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
  let active=null;
  function play({data,recipe,isActive=()=>true}={}){
    if(data?.ok!==true||data.category!=='MERCENARY_CRAFT'||!data.requestId||typeof data.success!=='boolean'||(data.success&&!data.output)||!isActive())return Promise.resolve(false);
    active?.();
    return new Promise(resolve=>{
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const success=data.success,name=data.output?.name||recipe?.output_name||data.recipeName||'용병';
      const art=url(data.output?.image||recipe?.output_image);
      const material=recipe?.materials?.[0],shard=url(material?.image_url)||'/assets/items/mercenary-sss-card-shard-v1.png';
      const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
      const root=document.createElement('div');root.className='mc-reveal cn-command-ui';root.dataset.phase='charging';root.dataset.motion=reduced?'reduced':'full';
      root.innerHTML=`<section class="mc-dialog cn-ui-panel" role="dialog" aria-modal="true" aria-labelledby="mc-title" tabindex="-1">
        <header class="mc-header"><div><small>MERCENARY ATELIER</small><span>용병 제작 <i>/</i> ${esc(name)}</span></div><button class="cn-ui-button mc-skip" type="button">바로 결과 보기 <span aria-hidden="true">↗</span></button></header>
        <div class="mc-heading"><p data-eyebrow>01 / 조각 결속</p><h2 id="mc-title">흩어진 힘을 하나로.</h2><p data-caption aria-live="polite">조각을 모아 계약의 봉인을 충전합니다.</p></div>
        <div class="mc-scene" aria-hidden="true"><canvas></canvas><div class="mc-beam"></div><div class="mc-halo"></div>
          <div class="mc-fragments">${Array.from({length:8},(_,i)=>`<img src="${esc(shard)}" alt="" draggable="false" style="--i:${i};--x:${Math.cos(i*Math.PI/4)*180}px;--y:${Math.sin(i*Math.PI/4)*170}px">`).join('')}</div>
          <div class="mc-contract"><div class="mc-leaf mc-leaf-left cn-ui-panel"></div><div class="mc-leaf mc-leaf-center cn-ui-panel"><span>SSS</span><small>LIMITED</small><i></i><b>각인 대기</b></div><div class="mc-leaf mc-leaf-right cn-ui-panel"></div></div>
          <figure class="mc-art" hidden><img alt=""><figcaption>SSS <span>LIMITED</span></figcaption></figure><div class="mc-broken" hidden><span>결속 소멸</span><small>CONTRACT LOST</small></div>
          <span class="mc-scene-label">FRAGMENT → CONTRACT</span>
        </div>
        <div class="mc-controls"><div class="mc-unseal"><div class="mc-charge-label"><span data-instruction>봉인 충전 중</span><b data-charge>0<small>%</small></b></div><div class="mc-track cn-ui-panel"><span data-track-label>충전이 끝나면 밀어서 개방</span><div class="mc-track-fill"></div><button type="button" class="mc-handle cn-ui-button primary" role="slider" aria-label="밀어서 용병 제작 결과 확인" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-describedby="mc-hint" disabled><span aria-hidden="true">→</span></button></div><p id="mc-hint">개방 조작은 제작 확률에 영향을 주지 않습니다.</p></div>
          <div class="mc-result" hidden aria-live="polite"><div><p data-result-name></p><p data-result-note></p><small data-spent></small></div><button class="cn-ui-button primary mc-done" type="button">확인</button></div>
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
      function setCharge(value){
        charge=Math.max(0,Math.min(1,value));const percent=Math.round(charge*100);
        root.style.setProperty('--mc-charge',charge);handle.style.transform=`translateX(${charge*Math.max(0,track.clientWidth-handle.offsetWidth-16)}px)`;
        handle.setAttribute('aria-valuenow',String(percent));handle.setAttribute('aria-valuetext',`${percent}%, 끝까지 밀어 결과 확인`);$('[data-charge]').innerHTML=`${percent}<small>%</small>`;
      }
      function ready(){
        if(!valid()){finish();return;}if(phase!=='charging')return;setPhase('sealed');handle.disabled=false;setCharge(0);
        $('[data-eyebrow]').textContent='02 / 계약 개방';$('#mc-title').textContent='새로운 힘이 깨어나는 순간.';$('[data-caption]').textContent='봉인을 밀어 제작 결과를 확인하세요.';
        $('[data-instruction]').textContent='개방 준비 완료';$('[data-track-label]').textContent='오른쪽 끝까지 밀어 개방';$('.mc-leaf-center b').textContent='봉인 완료';
      }
      function showResult(){
        if(!valid()){finish();return;}if(phase==='result')return;setPhase('result');resultAt=performance.now();drag=null;root.dataset.outcome=success?'success':'failure';
        $('.mc-unseal').hidden=true;$('.mc-result').hidden=false;$('.mc-skip').hidden=true;
        $('[data-eyebrow]').textContent=success?'03 / 각인 완성':'03 / 결속 소멸';$('#mc-title').textContent=success?'용병 제작 성공':'용병 제작 실패';
        $('[data-caption]').textContent=success?'봉인 너머, 새로운 동료가 응답했습니다.':'조각의 힘이 흩어져 각인을 완성하지 못했습니다.';
        $('[data-result-name]').textContent=success?`${name} ${Number(data.output.quantity||1)}장 획득`:`${name} · 획득 없음`;
        $('[data-result-note]').textContent=success?'완성된 용병이 보관함에 지급되었습니다.':'투입한 제작 재료와 재화는 소모되었습니다.';
        const costs=[];if(Number(data.coinSpent)>0)costs.push(`코인 ${fmt.format(data.coinSpent)}`);if(Number(data.masterStarSpent)>0)costs.push(`마스터의 별 ${fmt.format(data.masterStarSpent)}개`);if(Number(data.cardShardSpent)>0)costs.push(`카드 조각 ${fmt.format(data.cardShardSpent)}개`);
        $('[data-spent]').textContent=costs.length?`소모 · ${costs.join(' / ')}`:'';
        $('.mc-scene-label').textContent=success?'CONTRACT ENGRAVED':'FRAGMENTS DISPERSED';
        if(success){$('.mc-art').hidden=false;const img=$('.mc-art img');img.alt=name;img.onerror=()=>{img.hidden=true;root.classList.add('mc-art-unavailable');};if(art)img.src=art;else img.onerror();}
        else $('.mc-broken').hidden=false;
        tone('result');$('.mc-done').focus({preventScroll:true});
        later(()=>{cancelAnimationFrame(raf);ctx?.clearRect(0,0,canvas.width,canvas.height);root.classList.add('mc-settled');},2400);
      }
      function reveal(immediate=false){
        if(!valid()){finish();return;}if(phase==='result')return;
        unlockAudio();if(immediate||reduced){showResult();return;}if(phase!=='sealed')return;
        setCharge(1);drag=null;handle.disabled=true;setPhase('opening');openedAt=performance.now();tone('open');
        $('[data-caption]').textContent='봉인을 해제하고 각인을 확인합니다.';$('[data-track-label]').textContent='계약 개방 중';later(showResult,1350);
      }
      on(handle,'pointerdown',e=>{if(phase!=='sealed'||e.isPrimary===false||e.button!==0)return;e.preventDefault();unlockAudio();drag={id:e.pointerId,start:e.clientX,initial:charge};handle.setPointerCapture(e.pointerId);root.classList.add('mc-dragging');});
      on(handle,'pointermove',e=>{if(!drag||e.pointerId!==drag.id||phase!=='sealed')return;e.preventDefault();setCharge(drag.initial+(e.clientX-drag.start)/Math.max(1,track.clientWidth-handle.offsetWidth-16));if(charge>=.96)reveal();});
      const release=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;root.classList.remove('mc-dragging');if(phase==='sealed')setCharge(0);};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])on(handle,event,release);
      on(handle,'keydown',e=>{if(phase!=='sealed'||!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();unlockAudio();if(['End','Enter',' '].includes(e.key))reveal();else setCharge(e.key==='Home'?0:charge+(['ArrowLeft','ArrowDown'].includes(e.key)?-.1:.1));if(charge>=.96)reveal();});
      on($('.mc-skip'),'click',()=>reveal(true));on($('.mc-done'),'click',finish);
      on($('.mc-sound'),'click',()=>{sound=!sound;unlockAudio();soundLabel();});
      on(root,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();phase==='result'?finish():reveal(true);}if(e.key==='Tab'){const nodes=[...root.querySelectorAll('button:not(:disabled)')].filter(n=>!n.hidden&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
      on(window,'resize',()=>{if(phase==='sealed')setCharge(charge);resize();});
      on(window,'pagehide',finish);
      poll=setInterval(()=>{if(!valid())finish();},200);
      const canvas=$('canvas'),ctx=canvas.getContext('2d');let width=1,height=1;
      function resize(){const box=$('.mc-scene').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=box.width;height=box.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);}
      resize();const particles=Array.from({length:72},(_,i)=>({angle:i*2.39996,radius:.22+(i%11)/18,speed:.3+(i%7)*.1}));
      function frame(now){
        if(!valid()){finish();return;}raf=requestAnimationFrame(frame);if(now-lastFrame<32)return;lastFrame=now;ctx.clearRect(0,0,width,height);
        const cx=width/2,cy=height/2,r=Math.min(width,height)*.43,age=resultAt?(now-resultAt)/1000:0;
        for(const p of particles){const a=p.angle+now*.00012*p.speed,spread=phase==='charging'?1-(now-startedAt)%1500/1900:phase==='opening'?1+(now-openedAt)/800:1+charge*.25;
          let x=cx+Math.cos(a)*r*p.radius*spread,y=cy+Math.sin(a)*r*p.radius*spread*.9;
          if(phase==='result'){if(success){x=cx+Math.cos(a)*r*(.2+age*p.speed);y=cy+Math.sin(a)*r*(.2+age*p.speed);}else{y=cy+Math.sin(a)*r*p.radius+age*age*55;x+=Math.sin(p.angle)*age*20;}}
          ctx.globalAlpha=phase==='result'?Math.max(0,1-age/2.4):.25+charge*.35;ctx.fillStyle=phase==='result'?(success?'#eaff9b':'#ae7f94'):'#c1daff';ctx.fillRect(x,y,phase==='result'?2:1.4,phase==='result'&&!success?4:1.4);
        }ctx.globalAlpha=1;
      }
      const startedAt=performance.now();if(ctx&&!reduced)raf=requestAnimationFrame(frame);
      soundLabel();setPhase('charging');dialog.focus({preventScroll:true});later(ready,reduced?0:1250);
    });
  }
  window.MercenaryCraftReveal=Object.freeze({play,cancel:()=>active?.()});
})();
