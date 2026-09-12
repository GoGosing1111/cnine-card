(()=>{
  'use strict';
  const VERSION='1.2.0-random-two';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const directionMap=Object.freeze({ARROWUP:'UP',W:'UP',UP:'UP',ARROWRIGHT:'RIGHT',D:'RIGHT',RIGHT:'RIGHT',ARROWDOWN:'DOWN',S:'DOWN',DOWN:'DOWN',ARROWLEFT:'LEFT',A:'LEFT',LEFT:'LEFT'});
  const directionGlyph=Object.freeze({UP:'↑',RIGHT:'→',DOWN:'↓',LEFT:'←'});
  let cancelActive=null,screenModule=null,screenPromise=null,generation=0;
  const screenUrl=new URL('core-raid-screen-qte-v2086.js',document.currentScript?.src||location.href).href;
  function prepare(){return screenPromise||(screenPromise=import(screenUrl).then(module=>(screenModule=module)).catch(error=>{screenPromise=null;throw error;}));}

  const normalizeDirection=value=>directionMap[String(value||'').trim().toUpperCase()]||'';
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms||0))));
  const now=()=>globalThis.performance?.now?.()||Date.now();

  function shellMarkup(event,kind){
    const sequence=(Array.isArray(event.sequence)?event.sequence:[]).map(normalizeDirection).filter(Boolean);
    return `<section class="raid-qte-overlay is-${kind.toLowerCase()}" data-raid-qte="${kind}" role="dialog" aria-modal="true" aria-label="${esc(event.title||'레이드 입력 기믹')}">
      <div class="raid-qte-vignette"></div><div class="raid-qte-scan"></div>
      <header><small>CORE PROTOCOL / MANUAL INTERVENTION</small><b>${esc(event.title||'긴급 기믹')}</b><span data-qte-time>0.0</span></header>
      <div class="raid-qte-warning"><i></i><strong>${kind==='MASH'?'처형 구속 발생':'방향 신호 추적'}</strong><p>${esc(event.label||'제한시간 안에 입력을 완료하십시오.')}</p></div>
      <div class="raid-qte-sequence" ${kind==='SEQUENCE'?'':'hidden'}>${sequence.map((direction,index)=>`<i data-qte-step="${index}" aria-label="${direction}">${directionGlyph[direction]}</i>`).join('')}</div>
      ${kind==='SEQUENCE'?`<div class="raid-qte-inputs"><div class="raid-qte-swipe-zone" data-qte-swipe><span>SWIPE</span><b>이곳을 짧게 밀어도 입력됩니다</b><small>한 번 밀 때 한 방향</small></div><div class="raid-qte-dpad" role="group" aria-label="방향 터치 입력">${['UP','LEFT','DOWN','RIGHT'].map(dir=>`<button type="button" data-qte-dir="${dir}" aria-label="${{UP:'위',LEFT:'왼쪽',DOWN:'아래',RIGHT:'오른쪽'}[dir]} 방향">${directionGlyph[dir]}</button>`).join('')}</div></div>`:''}
      <button type="button" class="raid-qte-mash-pad" data-qte-mash ${kind==='MASH'?'':'hidden'}><span>연타</span><b><i data-qte-count>0</i> / ${Math.max(1,Number(event.target||24))}</b><em>SPACE · CLICK · TAP</em></button>
      <div class="raid-qte-progress"><i data-qte-progress></i></div>
      <footer><span data-qte-hint>${kind==='MASH'?'화면을 빠르게 연타해 구속을 파괴하십시오.':'방향 버튼 터치 · 스와이프 · 방향키/WASD'}</span><b data-qte-result aria-live="polite">입력 대기</b></footer>
    </section>`;
  }

  function mount(stage,event,kind){
    const holder=document.createElement('div');holder.innerHTML=shellMarkup(event,kind);const overlay=holder.firstElementChild;stage.appendChild(overlay);stage.classList.add('is-raid-qte-active');return overlay;
  }

  function commonRunner(event,context,kind,bindInput){
    const stage=context?.stage;if(!stage)return Promise.resolve({success:false,cancelled:true,kind});
    if(cancelActive)cancelActive();
    const duration=Math.max(2000,Math.min(20000,Number(event.windowMs||5000)));
    return new Promise(resolve=>{
      const overlay=mount(stage,event,kind),timeNode=overlay.querySelector('[data-qte-time]'),bar=overlay.querySelector('[data-qte-progress]'),resultNode=overlay.querySelector('[data-qte-result]');
      const started=now();let raf=0,settled=false,penalty=0,cleanupInput=()=>{},latestResult={};
      const elapsed=()=>Math.max(0,now()-started+penalty);
      const cleanup=()=>{cancelAnimationFrame(raf);globalThis.removeEventListener('pagehide',cancel);document.removeEventListener('visibilitychange',visibility);cleanupInput();stage.classList.remove('is-raid-qte-active');if(cancelActive===cancel)cancelActive=null};
      const finish=async(success,extra={})=>{
        if(settled)return;settled=true;latestResult={kind,success:Boolean(success),cancelled:Boolean(extra.cancelled),durationMs:Math.round(Math.min(duration,elapsed())),...extra};cleanup();overlay.classList.add(success?'is-success':'is-failure');if(resultNode)resultNode.textContent=success?(extra.perfect?'PERFECT BREAK':'기믹 해제'):(extra.cancelled?'입력 취소':'기믹 실패');await wait(success?520:680);overlay.remove();resolve(latestResult);
      };
      const cancel=()=>finish(false,{cancelled:true});cancelActive=cancel;
      const visibility=()=>{if(document.hidden)cancel();};globalThis.addEventListener('pagehide',cancel);document.addEventListener('visibilitychange',visibility);
      const addPenalty=amount=>{penalty+=Math.max(0,Number(amount||0));overlay.classList.remove('is-error');void overlay.offsetWidth;overlay.classList.add('is-error')};
      cleanupInput=bindInput({overlay,duration,started,elapsed,finish,addPenalty,isActive:()=>!settled&&elapsed()<duration,setResult:value=>{latestResult=value||{};}})||(()=>{});
      const tick=()=>{if(settled)return;const used=elapsed(),remaining=Math.max(0,duration-used),ratio=Math.max(0,Math.min(1,remaining/duration));if(timeNode)timeNode.textContent=(remaining/1000).toFixed(1);if(bar)bar.style.width=`${ratio*100}%`;if(remaining<=0){finish(Boolean(latestResult.success),latestResult);return}raf=requestAnimationFrame(tick)};tick();
    });
  }

  function runSequence(event,context){
    const expected=(Array.isArray(event.sequence)?event.sequence:[]).map(normalizeDirection).filter(Boolean);
    return commonRunner(event,context,'SEQUENCE',({overlay,duration,elapsed,finish,addPenalty,setResult,isActive})=>{
      let index=0,mistakes=0;const inputs=[],steps=[...overlay.querySelectorAll('[data-qte-step]')],result=()=>({success:index>=expected.length,perfect:index>=expected.length&&mistakes===0&&elapsed()<=duration*.72,inputs:[...inputs],mistakes,progress:index,total:expected.length});
      const paint=()=>steps.forEach((node,nodeIndex)=>{node.classList.toggle('is-current',nodeIndex===index);node.classList.toggle('is-complete',nodeIndex<index)});paint();setResult(result());
      const input=raw=>{const direction=normalizeDirection(raw);if(!isActive()||!direction||index>=expected.length)return;inputs.push({key:direction,at:Math.round(elapsed())});if(direction===expected[index]){index++;paint();const node=overlay.querySelector('[data-qte-result]');if(node)node.textContent=`${index} / ${expected.length} 입력`;const next=result();setResult(next);if(next.success)finish(true,next)}else{mistakes++;addPenalty(450);setResult(result())}};
      const keydown=keyboard=>{if(keyboard.repeat)return;const direction=normalizeDirection(keyboard.key);if(!direction)return;keyboard.preventDefault();keyboard.stopImmediatePropagation();input(direction)};
      let swipeStart=null;
      const releaseSwipe=()=>{const held=swipeStart;swipeStart=null;if(held)try{overlay.releasePointerCapture?.(held.pointerId)}catch(_){}};
      const pointerdown=pointer=>{
        if(!isActive()||(pointer.pointerType==='mouse'&&pointer.button!==0))return;
        const button=pointer.target.closest?.('[data-qte-dir]');
        if(button){pointer.preventDefault();pointer.stopPropagation();input(button.dataset.qteDir);return;}
        if(pointer.isPrimary===false||swipeStart)return;
        pointer.preventDefault();swipeStart={pointerId:pointer.pointerId,x:pointer.clientX,y:pointer.clientY,committed:false};try{overlay.setPointerCapture?.(pointer.pointerId)}catch(_){}
      };
      const pointermove=pointer=>{
        if(!swipeStart||swipeStart.pointerId!==pointer.pointerId||swipeStart.committed)return;
        pointer.preventDefault();const dx=pointer.clientX-swipeStart.x,dy=pointer.clientY-swipeStart.y,ax=Math.abs(dx),ay=Math.abs(dy);
        // Commit during the gesture; a lift, extra finger or compatibility click cannot count it twice.
        if(Math.max(ax,ay)<22||Math.max(ax,ay)<Math.min(ax,ay)*1.2)return;
        swipeStart.committed=true;input(ax>ay?(dx>0?'RIGHT':'LEFT'):(dy>0?'DOWN':'UP'));
      };
      const pointerup=pointer=>{if(swipeStart?.pointerId!==pointer.pointerId)return;pointermove(pointer);releaseSwipe();};
      const pointercancel=pointer=>{if(swipeStart?.pointerId===pointer.pointerId)releaseSwipe();};
      const click=event=>{const button=event.target.closest?.('[data-qte-dir]');if(button&&event.detail===0){event.preventDefault();input(button.dataset.qteDir);}};
      globalThis.addEventListener('keydown',keydown,{capture:true});overlay.addEventListener('pointerdown',pointerdown,{passive:false});overlay.addEventListener('pointermove',pointermove,{passive:false});overlay.addEventListener('pointerup',pointerup,{passive:false});overlay.addEventListener('pointercancel',pointercancel);overlay.addEventListener('lostpointercapture',pointercancel);overlay.addEventListener('click',click);
      return()=>{releaseSwipe();globalThis.removeEventListener('keydown',keydown,{capture:true});overlay.removeEventListener('pointerdown',pointerdown);overlay.removeEventListener('pointermove',pointermove);overlay.removeEventListener('pointerup',pointerup);overlay.removeEventListener('pointercancel',pointercancel);overlay.removeEventListener('lostpointercapture',pointercancel);overlay.removeEventListener('click',click)};
    });
  }

  function runMash(event,context){
    const target=Math.max(1,Math.min(100,Number(event.target||24)));
    return commonRunner(event,context,'MASH',({overlay,duration,elapsed,finish,setResult,isActive})=>{
      let count=0,lastAt=-1000;const presses=[],countNode=overlay.querySelector('[data-qte-count]'),pad=overlay.querySelector('[data-qte-mash]');
      const press=()=>{const at=elapsed();if(!isActive()||at-lastAt<30)return;lastAt=at;count++;presses.push(Math.round(at));if(countNode)countNode.textContent=String(count);pad?.style.setProperty('--mash-ratio',String(Math.min(1,count/target)));pad?.classList.remove('is-hit');void pad?.offsetWidth;pad?.classList.add('is-hit');const success=count>=target,perfect=success&&at<=duration*.72,result={success,perfect,count,target,presses:[...presses]};setResult(result);if(success)finish(true,result)};
      const keydown=keyboard=>{if(keyboard.repeat||![' ','ENTER','Z'].includes(String(keyboard.key||'').toUpperCase()))return;keyboard.preventDefault();keyboard.stopImmediatePropagation();press()};
      const pointer=pointer=>{if((pointer.pointerType==='mouse'&&pointer.button!==0)||!pointer.target.closest?.('[data-qte-mash]'))return;pointer.preventDefault();press()};
      globalThis.addEventListener('keydown',keydown,{capture:true});overlay.addEventListener('pointerdown',pointer,{passive:false});setResult({success:false,perfect:false,count,target,presses});
      return()=>{globalThis.removeEventListener('keydown',keydown,{capture:true});overlay.removeEventListener('pointerdown',pointer)};
    });
  }

  async function run(event={},context={}){
    cancel();const current=generation,type=String(event.type||'').toUpperCase();
    if(type==='RAID_QTE_SEQUENCE')return runSequence(event,context);
    if(type==='RAID_QTE_MASH')return runMash(event,context);
    const kind=type.replace(/^RAID_QTE_/,'');
    if(!['CENTER','CIRCUIT','SHELTER'].includes(kind))throw new Error('지원하지 않는 기믹입니다. 새로고침 후 재개하세요.');
    const module=await prepare();
    if(current!==generation)return {kind,success:false,cancelled:true};
    return module.run(kind,{stage:context.stage,seed:event.mechanic?.seed,slot:event.mechanicSlot,count:event.mechanicCount});
  }
  function cancel(){generation++;if(cancelActive)cancelActive();screenModule?.cancel();}
  globalThis.ProjectVRaidQteV1924=Object.freeze({version:VERSION,prepare,run,cancel});
})();
