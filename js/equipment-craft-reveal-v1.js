/* Equipment fabrication presentation. Only a committed receipt may enter this
 * screen. Sliding, skipping and closing are local: they never send a mutation. */
(()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>Number(v||0).toLocaleString('ko-KR');
  const imageUrl=value=>{try{const u=new URL(String(value||''),location.origin+'/');return value&&/^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
  const crest='<img src="/assets/ui/workshop/emperor-seal-v1.webp" alt="" draggable="false">';
  let active=null;
  function play({data,recipe,isActive=()=>true}){
    if(!data?.equipmentCraft||data.ok!==true||typeof data.success!=='boolean'||!isActive())return Promise.resolve(false);
    active?.();
    return new Promise(resolve=>{
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const success=data.success===true&&!!data.output,consumed=data.input?.preserved===false;
      const name=data.output?.name||recipe?.output_name||data.recipeName||'장비';
      const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
      const root=document.createElement('div');root.className='ef-reveal';root.dataset.phase='sealed';root.dataset.motion=reduced?'reduced':'full';
      root.innerHTML=`<section class="ef-dialog" role="dialog" aria-modal="true" aria-labelledby="ef-title" tabindex="-1">
        <div class="ef-backdrop" aria-hidden="true"></div><div class="ef-shade" aria-hidden="true"></div>
        <header class="ef-header"><div><small>제작소 / 장비 제작</small><strong>${esc(name)}</strong></div><button type="button" class="ef-skip" data-skip>바로 결과 보기 <span aria-hidden="true">↗</span></button></header>
        <div class="ef-heading"><p data-kicker>FORGE · SEALED</p><h2 id="ef-title">봉인된 제작 결과</h2><div data-subtitle>당신의 손으로 봉인을 해제하세요.</div></div>
        <div class="ef-scene" aria-hidden="true"><canvas></canvas><div class="ef-rays"></div><div class="ef-wave"></div><div class="ef-orbit ef-orbit-one"></div><div class="ef-orbit ef-orbit-two"></div><div class="ef-seam"></div>
          <div class="ef-seal"><div class="ef-gate ef-gate-left">${crest}</div><div class="ef-gate ef-gate-right">${crest}</div><div class="ef-sigil">◆</div></div>
          <div class="ef-relic" hidden><img alt=""><span class="ef-image-fallback" hidden>◆</span><div class="ef-relic-label"></div></div><div class="ef-failure" hidden><div class="ef-shard ef-shard-a"></div><div class="ef-shard ef-shard-b"></div><div class="ef-shard ef-shard-c"></div><span>FORGE FAILED</span></div>
        </div>
        <div class="ef-controls"><div class="ef-unseal"><div class="ef-slide-caption"><span>봉인 해제</span><b data-charge>0<small>%</small></b></div><div class="ef-track"><div class="ef-track-fill"></div><span class="ef-track-label">밀어서 확인하기 <i aria-hidden="true">› › ›</i></span><button type="button" class="ef-handle" role="slider" aria-label="밀어서 제작 결과 확인" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0%, 오른쪽 끝으로 밀어서 결과 확인" aria-describedby="ef-hint"><span aria-hidden="true">⟫</span></button><span class="ef-track-end" aria-hidden="true">◇</span></div><p id="ef-hint">오른쪽 끝까지 밀어 봉인을 해제하세요.</p></div>
          <div class="ef-result" hidden aria-live="polite"><strong data-item></strong><p data-note></p><div class="ef-pity"><span data-pity></span><b data-next></b></div><button type="button" class="ef-done">확인</button></div>
        </div>
        <footer class="ef-footer"><span>01 제작 <i></i> <b data-step>02 봉인 해제</b> <i></i> <span data-final-step>03 결과</span></span><button type="button" data-sound aria-pressed="false">사운드 OFF</button></footer>
      </section>`;
      document.body.append(root);document.body.style.overflow='hidden';
      const $=s=>root.querySelector(s),dialog=$('.ef-dialog'),handle=$('.ef-handle'),track=$('.ef-track');
      let closed=false,phase='sealed',charge=0,drag=null,raf=0,poll=0,observer=null,audio=null,sound=false,burstAt=0,lastFrame=0;
      const timers=new Set(),cleanups=[];
      const listen=(node,type,fn,opts)=>{node.addEventListener(type,fn,opts);cleanups.push(()=>node.removeEventListener(type,fn,opts));};
      const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(!closed)fn();},ms);timers.add(id);return id;};
      const valid=()=>!closed&&root.isConnected&&isActive();
      function finish(){
        if(closed)return;closed=true;timers.forEach(clearTimeout);clearInterval(poll);cancelAnimationFrame(raf);observer?.disconnect();cleanups.forEach(fn=>fn());audio?.close().catch(()=>{});root.remove();
        if(active===finish)active=null;if(document.body.style.overflow==='hidden')document.body.style.overflow=previousOverflow;
        if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve(true);
      }
      active=finish;
      function tone(kind){
        if(!sound||!audio)return;
        try{const t=audio.currentTime,notes=kind==='release'?[88,132,176]:success?[392,494,587]:[110,87,65];
          notes.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*.7,t+1.1);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.03+i*.1);g.gain.exponentialRampToValueAtTime(.0001,t+1.5);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+1.5);});
        }catch{/* Sound is optional and cannot block a saved result. */}
      }
      function setCharge(value){
        charge=Math.max(0,Math.min(1,value));const amount=Math.round(charge*100);
        root.style.setProperty('--ef-charge',charge);handle.style.transform=`translateX(${charge*Math.max(0,track.clientWidth-handle.offsetWidth-12)}px)`;
        handle.setAttribute('aria-valuenow',amount);handle.setAttribute('aria-valuetext',`${amount}%, 오른쪽 끝으로 밀어서 결과 확인`);$('[data-charge]').innerHTML=`${amount}<small>%</small>`;
      }
      function showResult(){
        if(!valid()){finish();return;}if(phase==='result')return;phase='result';root.dataset.phase='result';root.dataset.outcome=success?'success':'failure';
        $('.ef-unseal').hidden=true;$('.ef-result').hidden=false;$('[data-skip]').hidden=true;
        $('[data-kicker]').textContent=success?'FORGE · COMPLETE':'FORGE · FAILED';$('#ef-title').textContent=success?'장비 제작 성공':'장비 제작 실패';
        $('[data-subtitle]').textContent=success?'새로운 힘이 완성되었습니다.':consumed?'투입한 +10 장비가 소모되었습니다.':'투입한 +10 장비는 보존되었습니다.';
        $('[data-item]').textContent=success?`${name} +0 획득`:`+10 ${data.input?.name||'투입 장비'} ${consumed?'소모':'보존'}`;
        $('[data-note]').textContent=success?'완성된 장비가 지급되었습니다. 투입 장비와 제작 재료·재화가 소모되었습니다.':'새 장비를 획득하지 못했습니다. 재료·마스터의 별·코인은 소모되었습니다.';
        $('[data-pity]').textContent=success?'실패 누적 초기화':`실패 누적 ${fmt(data.pity?.failures)} / ${fmt(data.pity?.pityAfter)}회`;
        $('[data-next]').textContent=success?'제작 완료':data.pity?.guaranteed?'다음 제작 100% 성공':'누적 횟수 유지';
        $('[data-final-step]').className='ef-current';
        if(success){const img=$('.ef-relic img'),src=imageUrl(data.output.image);$('.ef-relic').hidden=false;$('.ef-relic-label').textContent='+0';img.alt=name;
          img.onerror=()=>{img.hidden=true;$('.ef-image-fallback').hidden=false;};if(src)img.src=src;else img.onerror();
        }else $('.ef-failure').hidden=false;
        tone('result');$('.ef-done').focus({preventScroll:true});
      }
      function reveal(immediate=false){
        if(!valid()){finish();return;}if(phase==='result')return;
        if(immediate){showResult();return;}if(phase!=='sealed')return;
        phase='opening';root.dataset.phase='opening';setCharge(1);drag=null;handle.disabled=true;
        $('.ef-track-label').textContent='봉인을 해제합니다';$('[data-subtitle]').textContent='제작 결과가 모습을 드러냅니다.';$('#ef-hint').textContent='';
        burstAt=performance.now();tone('release');later(showResult,reduced?80:1850);
      }
      function down(e){if(phase!=='sealed'||e.isPrimary===false||e.button!==0)return;e.preventDefault();drag={id:e.pointerId,start:e.clientX,initial:charge};handle.setPointerCapture(e.pointerId);root.classList.add('ef-dragging');}
      function move(e){if(!drag||drag.id!==e.pointerId||phase!=='sealed')return;e.preventDefault();setCharge(drag.initial+(e.clientX-drag.start)/Math.max(1,track.clientWidth-handle.offsetWidth-12));if(charge>=.96)reveal();}
      function release(e){if(!drag||e.pointerId!==drag.id)return;drag=null;root.classList.remove('ef-dragging');if(phase==='sealed')setCharge(0);}
      listen(handle,'pointerdown',down);listen(handle,'pointermove',move);listen(handle,'pointerup',release);listen(handle,'pointercancel',release);listen(handle,'lostpointercapture',release);
      listen(handle,'keydown',e=>{if(phase!=='sealed')return;if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End','Enter',' '].includes(e.key)){
        e.preventDefault();if(['End','Enter',' '].includes(e.key))reveal();else setCharge(e.key==='Home'?0:charge+(['ArrowLeft','ArrowDown'].includes(e.key)?-.1:.1));if(charge>=.96)reveal();
      }});
      listen($('[data-skip]'),'click',()=>reveal(true));listen($('.ef-done'),'click',finish);
      listen($('[data-sound]'),'click',async()=>{sound=!sound;try{if(sound){audio||=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();}}catch{sound=false;}if(closed)return;$('[data-sound]').textContent=`사운드 ${sound?'ON':'OFF'}`;$('[data-sound]').setAttribute('aria-pressed',String(sound));});
      listen(document,'keydown',e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();phase==='result'?finish():reveal(true);return;}
        if(e.key!=='Tab')return;
        const buttons=[...root.querySelectorAll('button:not([disabled])')].filter(el=>el.getClientRects().length),first=buttons[0],last=buttons.at(-1);
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){e.preventDefault();first?.focus();}
      },true);
      listen(window,'cnine:route-will-change',finish);listen(window,'pagehide',finish);
      poll=setInterval(()=>{if(!valid())finish();},250);observer=new MutationObserver(()=>{if(!valid())finish();});observer.observe(document.body,{childList:true});
      handle.focus({preventScroll:true});
      // Bounded cosmetic particles. They never determine the crafting outcome.
      const canvas=$('canvas');let ctx=null;try{ctx=canvas.getContext('2d');}catch{}let width=0,height=0;
      const sparks=Array.from({length:70},()=>({x:Math.random(),y:Math.random(),speed:.015+Math.random()*.025,size:.5+Math.random()*1.3,drift:Math.random()*6.28}));
      const burst=Array.from({length:76},(_,i)=>({a:i/76*Math.PI*2,len:.45+Math.random()*.7}));
      function resize(){const box=$('.ef-scene').getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);width=box.width;height=box.height;canvas.width=width*dpr;canvas.height=height*dpr;ctx?.setTransform(dpr,0,0,dpr,0,0);if(phase==='sealed')setCharge(charge);}
      listen(window,'resize',resize);resize();
      function frame(now){
        if(!valid()){finish();return;}raf=requestAnimationFrame(frame);if(document.hidden||now-lastFrame<30||!ctx)return;
        const dt=Math.min(.06,(now-lastFrame)/1000);lastFrame=now;ctx.clearRect(0,0,width,height);
        for(const s of sparks){s.y-=s.speed*dt*(1+charge*2);if(s.y<0)s.y=1;const x=s.x*width+Math.sin(now/1800+s.drift)*12,y=s.y*height;
          ctx.globalAlpha=(.2+Math.sin(s.y*Math.PI)*.6)*(phase==='result'&&!success ? .35 : 1);ctx.fillStyle='#f9ca76';ctx.fillRect(x,y,s.size,s.size*(2+charge*3));}
        const age=burstAt?(now-burstAt)/1000:100;
        if(age<2.3){const extent=Math.min(width,height)*.47*(1-Math.exp(-age*2.5));ctx.globalAlpha=Math.max(0,1-age/2.3);ctx.strokeStyle='#ffdda2';ctx.lineWidth=1;
          for(const b of burst){const r=extent*b.len;ctx.beginPath();ctx.moveTo(width/2+Math.cos(b.a)*r,height/2+Math.sin(b.a)*r);ctx.lineTo(width/2+Math.cos(b.a)*(r+14*(1-age/2.3)),height/2+Math.sin(b.a)*(r+14*(1-age/2.3)));ctx.stroke();}}
        ctx.globalAlpha=1;
      }
      if(!reduced&&ctx)raf=requestAnimationFrame(frame);
    });
  }
  window.EquipmentCraftReveal=Object.freeze({play,cancel:()=>active?.()});
})();
