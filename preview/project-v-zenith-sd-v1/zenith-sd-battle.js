(()=>{
  'use strict';

  const DESIGN={width:1600,height:738};
  const TILE={width:145,height:72};
  const MANIFEST_URL='../../assets/ui/project-v/characters/zenith/manifest-v1.json';
  const BACKGROUND_URL='../../assets/ui/idle-dungeon/moon-citadel-v1.png';
  const VALID_SCOPE='BATTLE_ENGINE_ONLY';
  const VALID_STAGES=new Set(['DARK_STAGE','MAGENTA']);
  const VALID_ACTIONS=new Set(['IDLE','DASH','ATTACK']);

  const root=document.getElementById('battleStage');
  const canvas=document.getElementById('battleCanvas');
  const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  const loading=document.getElementById('loading');
  const loadingTitle=document.getElementById('loadingTitle');
  const loadingCount=document.getElementById('loadingCount');
  const readyCount=document.getElementById('readyCount');
  const totalCount=document.getElementById('totalCount');
  const missingCount=document.getElementById('missingCount');
  const manifestScope=document.getElementById('manifestScope');
  const selectionOrder=document.getElementById('selectionOrder');
  const selectionCardId=document.getElementById('selectionCardId');
  const selectionMember=document.getElementById('selectionMember');
  const selectionTitle=document.getElementById('selectionTitle');
  const selectionPath=document.getElementById('selectionPath');
  const selectionStatus=document.getElementById('selectionStatus');
  const selectionAlpha=document.getElementById('selectionAlpha');
  const selectionMargin=document.getElementById('selectionMargin');
  const sourceArtLink=document.getElementById('sourceArtLink');

  let manifest=null;
  let roster=[];
  let background=null;
  let scale=1;
  let offsetX=0;
  let offsetY=0;
  let selected=-1;
  let stageMode='DARK_STAGE';
  let action='IDLE';
  let actionStart=0;
  let showBounds=false;
  let showMargin=false;
  let raf=0;
  let stopped=false;

  const slots=Array.from({length:30},(_,index)=>{
    const row=Math.floor(index/10);
    const column=index%10;
    return [92+column*157,206+row*202];
  });

  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const easeOutCubic=value=>1-Math.pow(1-value,3);
  const easeInOut=value=>value<.5?4*value*value*value:1-Math.pow(-2*value+2,3)/2;

  const safeAssetUrl=path=>{
    if(typeof path!=='string'||!path.startsWith('assets/')||path.includes('..')||path.includes('\\')||path.includes(':'))throw new Error(`Unsafe asset path: ${String(path)}`);
    return new URL(`../../${path}`,window.location.href).href;
  };

  const validateManifest=data=>{
    if(!data||data.schemaVersion!==2)throw new Error('ZENITH manifest schemaVersion 2가 필요합니다.');
    if(data.scope!==VALID_SCOPE)throw new Error('ZENITH SD scope는 BATTLE_ENGINE_ONLY여야 합니다.');
    if(!data.routingContract?.battleEngineOnly||!data.routingContract?.neverFallbackSourceArtInBattle)throw new Error('전투 전용 라우팅 계약이 누락되었습니다.');
    const expected=data.rosterSnapshot?.expectedCount;
    if(!Number.isInteger(expected)||!Array.isArray(data.characters)||data.characters.length!==expected)throw new Error('ZENITH roster 수가 manifest 계약과 다릅니다.');
    const ids=new Set();
    data.characters.forEach((entry,index)=>{
      if(entry.order!==index+1)throw new Error(`ZENITH order 불일치: ${entry.cardId||index}`);
      if(!/^CN-[A-F0-9]{16}$/.test(entry.cardId)||ids.has(entry.cardId))throw new Error(`중복 또는 잘못된 cardId: ${entry.cardId}`);
      ids.add(entry.cardId);
      safeAssetUrl(entry.sourceArt);
      safeAssetUrl(entry.battleSprite);
      if(!entry.battleSprite.startsWith('assets/ui/project-v/characters/zenith/'))throw new Error(`전투 스프라이트 경로 이탈: ${entry.cardId}`);
      for(const format of ['avif','webp']){
        const variants=entry.responsive?.[format];
        if(!Array.isArray(variants)||variants.length!==2)throw new Error(`반응형 ${format.toUpperCase()} 계약 누락: ${entry.cardId}`);
        variants.forEach(variant=>{
          safeAssetUrl(variant.path);
          if(![384,768].includes(variant.width)||!Number.isInteger(variant.height)||variant.height<1)throw new Error(`반응형 ${format.toUpperCase()} 규격 오류: ${entry.cardId}`);
        });
      }
      if(entry.qa?.assetStatus!=='TECHNICAL_PASS'||entry.qa?.visualApproval!==true)throw new Error(`기술 통과/시각 승인 계약 불일치: ${entry.cardId}`);
      if(!/^[A-F0-9]{64}$/.test(entry.sha256||''))throw new Error(`스프라이트 해시 누락: ${entry.cardId}`);
    });
    return data;
  };

  const loadImage=src=>new Promise((resolve,reject)=>{
    const image=new Image();
    image.decoding='async';
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error(`Image load failed: ${src}`));
    image.src=src;
  });

  const actorAssetCandidates=actor=>{
    const preferred=[];
    for(const format of ['avif','webp']){
      const variants=[...(actor.responsive?.[format]||[])].sort((a,b)=>b.width-a.width);
      const candidate=variants.find(item=>item.width===768)||variants[0];
      if(candidate)preferred.push(candidate.path);
    }
    preferred.push(actor.battleSprite);
    return [...new Set(preferred)].map(path=>({
      path,
      url:`${safeAssetUrl(path)}?sha=${actor.sha256.slice(0,16)}`
    }));
  };

  const loadActorImage=async actor=>{
    const errors=[];
    for(const candidate of actorAssetCandidates(actor)){
      try{return {image:await loadImage(candidate.url),path:candidate.path}}
      catch(error){errors.push(error instanceof Error?error.message:String(error))}
    }
    throw new Error(errors.join(' / ')||`No sprite candidates: ${actor.cardId}`);
  };

  const analyzeAlpha=(image,threshold,minimumSafeMargin)=>{
    const probe=document.createElement('canvas');
    probe.width=image.naturalWidth;
    probe.height=image.naturalHeight;
    const pctx=probe.getContext('2d',{willReadFrequently:true});
    pctx.drawImage(image,0,0);
    const data=pctx.getImageData(0,0,probe.width,probe.height).data;
    let minX=probe.width,minY=probe.height,maxX=-1,maxY=-1;
    let hasTransparency=false;
    for(let y=0;y<probe.height;y++){
      for(let x=0;x<probe.width;x++){
        const alpha=data[(y*probe.width+x)*4+3];
        if(alpha<255)hasTransparency=true;
        if(alpha>threshold){
          if(x<minX)minX=x;
          if(x>maxX)maxX=x;
          if(y<minY)minY=y;
          if(y>maxY)maxY=y;
        }
      }
    }
    if(maxX<0){
      return {valid:false,hasTransparency,bounds:{x:0,y:0,w:probe.width,h:probe.height},margins:{left:0,top:0,right:0,bottom:0},edgeAlphaClear:false,safeMarginPass:false,minimumSafeMargin,canvas:{width:probe.width,height:probe.height}};
    }
    const margins={left:minX,top:minY,right:probe.width-1-maxX,bottom:probe.height-1-maxY};
    const edgeAlphaClear=margins.left>0&&margins.top>0&&margins.right>0&&margins.bottom>0;
    return {
      valid:true,
      hasTransparency,
      bounds:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},
      margins,
      edgeAlphaClear,
      safeMarginPass:Math.min(margins.left,margins.top,margins.right,margins.bottom)>=minimumSafeMargin,
      minimumSafeMargin,
      canvas:{width:probe.width,height:probe.height}
    };
  };

  const stableTexture=(actor,targetHeight)=>{
    actor.rasterCache||=new Map();
    const height=Math.max(1,Math.round(targetHeight*scale));
    const width=Math.max(1,Math.round(height*(actor.analysis.bounds.w/actor.analysis.bounds.h)));
    const key=`${width}x${height}`;
    if(actor.rasterCache.has(key))return actor.rasterCache.get(key);
    const surface=document.createElement('canvas');
    surface.width=width;
    surface.height=height;
    const sctx=surface.getContext('2d',{alpha:true});
    sctx.imageSmoothingEnabled=true;
    sctx.imageSmoothingQuality='high';
    const b=actor.analysis.bounds;
    sctx.drawImage(actor.image,b.x,b.y,b.w,b.h,0,0,width,height);
    const texture={surface,width,height};
    actor.rasterCache.set(key,texture);
    return texture;
  };

  const fit=()=>{
    const rect=root.getBoundingClientRect();
    const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));
    canvas.height=Math.max(1,Math.round(rect.height*dpr));
    canvas.style.width=`${rect.width}px`;
    canvas.style.height=`${rect.height}px`;
    scale=Math.min(canvas.width/DESIGN.width,canvas.height/DESIGN.height);
    offsetX=(canvas.width-DESIGN.width*scale)/2;
    offsetY=(canvas.height-DESIGN.height*scale)/2;
    roster.forEach(actor=>actor.rasterCache?.clear());
  };

  const diamond=(x,y,w,h,fill,stroke,lineWidth=1.2)=>{
    ctx.beginPath();
    ctx.moveTo(x,y-h/2);
    ctx.lineTo(x+w/2,y);
    ctx.lineTo(x,y+h/2);
    ctx.lineTo(x-w/2,y);
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
    ctx.strokeStyle=stroke;
    ctx.lineWidth=lineWidth;
    ctx.stroke();
  };

  const coverImage=(image)=>{
    const iw=image.naturalWidth,ih=image.naturalHeight;
    const imageScale=Math.max(DESIGN.width/iw,DESIGN.height/ih);
    const width=iw*imageScale,height=ih*imageScale;
    ctx.drawImage(image,(DESIGN.width-width)/2,(DESIGN.height-height)/2,width,height);
  };

  const drawBackground=()=>{
    if(stageMode==='MAGENTA'){
      ctx.fillStyle='#ff00b8';
      ctx.fillRect(0,0,DESIGN.width,DESIGN.height);
      const size=48;
      ctx.fillStyle='rgba(79,0,57,.2)';
      for(let y=0;y<DESIGN.height;y+=size){for(let x=0;x<DESIGN.width;x+=size){if(((x/size+y/size)&1)===0)ctx.fillRect(x,y,size,size)}}
      ctx.fillStyle='rgba(255,255,255,.07)';
      ctx.fillRect(0,0,DESIGN.width,2);
      return;
    }
    if(background)coverImage(background);else{ctx.fillStyle='#07121c';ctx.fillRect(0,0,DESIGN.width,DESIGN.height)}
    const vertical=ctx.createLinearGradient(0,0,0,DESIGN.height);
    vertical.addColorStop(0,'rgba(1,5,10,.72)');
    vertical.addColorStop(.46,'rgba(4,14,22,.22)');
    vertical.addColorStop(1,'rgba(0,3,8,.84)');
    ctx.fillStyle=vertical;
    ctx.fillRect(0,0,DESIGN.width,DESIGN.height);
    const glow=ctx.createRadialGradient(800,360,60,800,360,720);
    glow.addColorStop(0,'rgba(46,177,205,.18)');
    glow.addColorStop(.58,'rgba(7,22,33,.05)');
    glow.addColorStop(1,'rgba(0,0,0,.7)');
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,DESIGN.width,DESIGN.height);
  };

  const drawArena=()=>{
    ctx.save();
    const arena=ctx.createLinearGradient(0,100,0,DESIGN.height);
    arena.addColorStop(0,stageMode==='MAGENTA'?'rgba(20,0,20,.08)':'rgba(18,53,67,.14)');
    arena.addColorStop(1,stageMode==='MAGENTA'?'rgba(20,0,20,.22)':'rgba(3,13,21,.72)');
    ctx.beginPath();
    ctx.moveTo(800,66);ctx.lineTo(1570,342);ctx.lineTo(800,726);ctx.lineTo(30,342);ctx.closePath();
    ctx.fillStyle=arena;ctx.fill();
    ctx.strokeStyle=stageMode==='MAGENTA'?'rgba(255,255,255,.32)':'rgba(113,239,255,.2)';ctx.stroke();
    slots.forEach(([x,y],index)=>{
      const active=index===selected;
      const pending=!roster[index]?.image;
      diamond(x,y,TILE.width,TILE.height,active?'rgba(113,239,255,.22)':pending?'rgba(14,16,24,.48)':'rgba(13,43,57,.32)',active?'rgba(174,249,255,.96)':pending?'rgba(156,128,150,.3)':'rgba(95,174,199,.34)',active?2:1.2);
      diamond(x,y,TILE.width-13,TILE.height-7,'rgba(2,10,16,.2)',active?'rgba(218,252,255,.5)':'rgba(127,185,205,.12)');
    });
    ctx.restore();
  };

  const actionTransform=(index,time)=>{
    const transform={dx:0,dy:0,rotation:0,scaleX:1,scaleY:1,ghost:0,slash:0};
    if(action==='IDLE'){
      transform.dy=Math.round(Math.sin(time*.0024+index*.63)*2);
      transform.scaleX=1+Math.sin(time*.0024+index*.63)*.008;
      transform.scaleY=1-Math.sin(time*.0024+index*.63)*.012;
      return transform;
    }
    const isTarget=selected<0||selected===index;
    if(!isTarget)return transform;
    const local=time-actionStart-(selected<0?index*26:0);
    if(local<0)return transform;
    if(action==='DASH'){
      if(local<140){const t=easeInOut(local/140);transform.dx=-13*t;transform.dy=6*t;transform.scaleX=1.04;transform.scaleY=.94}
      else if(local<300){const t=easeOutCubic((local-140)/160);transform.dx=-13+91*t;transform.dy=6-35*t;transform.scaleX=1.08;transform.scaleY=.92;transform.ghost=.55}
      else if(local<410){transform.dx=78;transform.dy=-29;transform.rotation=.055;transform.scaleX=1.04;transform.scaleY=.96}
      else if(local<850){const t=easeOutCubic((local-410)/440);transform.dx=78*(1-t);transform.dy=-29*(1-t);transform.rotation=.055*(1-t)}
      return transform;
    }
    if(action==='ATTACK'){
      if(local<180){const t=easeInOut(local/180);transform.dx=-10*t;transform.dy=4*t;transform.rotation=-.11*t;transform.scaleX=1.04;transform.scaleY=.94}
      else if(local<290){const t=easeOutCubic((local-180)/110);transform.dx=-10+38*t;transform.dy=4-17*t;transform.rotation=-.11+.31*t;transform.scaleX=1.1;transform.scaleY=.9;transform.slash=t}
      else if(local<390){transform.dx=28;transform.dy=-13;transform.rotation=.2;transform.scaleX=1.06;transform.scaleY=.94;transform.slash=1-(local-290)/100}
      else if(local<760){const t=easeOutCubic((local-390)/370);transform.dx=28*(1-t);transform.dy=-13*(1-t);transform.rotation=.2*(1-t);transform.scaleX=1.06-.06*t;transform.scaleY=.94+.06*t}
    }
    return transform;
  };

  const drawShadow=(x,y,width,alpha=.62)=>{
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.filter='blur(5px)';
    ctx.fillStyle='#000';
    ctx.beginPath();ctx.ellipse(x,y+5,Math.max(28,width*.3),8,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  };

  const drawSlash=(x,y,progress)=>{
    if(progress<=0)return;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-.72);
    ctx.globalAlpha=clamp(progress,0,1);
    ctx.shadowColor='#fff2a5';ctx.shadowBlur=18;
    ctx.strokeStyle='#fff4ac';ctx.lineWidth=6;
    ctx.beginPath();ctx.arc(0,0,52,-1.22,1.05);ctx.stroke();
    ctx.shadowColor='#52edff';ctx.shadowBlur=12;ctx.strokeStyle='#66eefe';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,61,-1.1,.92);ctx.stroke();
    ctx.restore();
  };

  const drawDiagnostics=(actor,left,top,width,height)=>{
    if(showMargin){
      const ratio=height/actor.analysis.bounds.h;
      const margins=actor.analysis.margins;
      const outerX=left-margins.left*ratio;
      const outerY=top-margins.top*ratio;
      const outerW=actor.analysis.canvas.width*ratio;
      const outerH=actor.analysis.canvas.height*ratio;
      ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle=actor.analysis.safeMarginPass?'#72ffc2':'#ff627a';ctx.lineWidth=1.4;ctx.strokeRect(outerX,outerY,outerW,outerH);ctx.setLineDash([]);
      ctx.fillStyle=actor.analysis.safeMarginPass?'#72ffc2':'#ff627a';ctx.font='800 9px Arial,sans-serif';ctx.textAlign='left';ctx.fillText(`SAFE ${actor.qa?.safeMarginPx??Math.min(...Object.values(margins))}px`,outerX,outerY-4);ctx.restore();
    }
    if(showBounds){
      ctx.save();ctx.strokeStyle='#71efff';ctx.lineWidth=1.4;ctx.strokeRect(left,top,width,height);ctx.fillStyle='#baf9ff';ctx.font='800 9px Arial,sans-serif';ctx.textAlign='right';ctx.fillText(`α ${actor.analysis.bounds.w}×${actor.analysis.bounds.h}`,left+width,top-4);ctx.restore();
    }
  };

  const drawPending=(actor,index)=>{
    const [x,y]=slots[index];
    actor.hit={x:x-TILE.width/2,y:y-TILE.height/2-60,w:TILE.width,h:TILE.height+95};
    ctx.save();ctx.textAlign='center';ctx.fillStyle=index===selected?'#e9fdff':'rgba(197,214,222,.56)';ctx.font='900 22px Arial,sans-serif';ctx.fillText(String(index+1).padStart(2,'0'),x,y-21);ctx.fillStyle=index===selected?'#aef7ff':'rgba(164,184,195,.5)';ctx.font='850 9px Pretendard,sans-serif';ctx.fillText('ASSET PENDING',x,y-6);ctx.fillStyle=index===selected?'#f5fbff':'rgba(193,208,216,.7)';ctx.font='900 11px Pretendard,sans-serif';ctx.fillText(actor.member,x,y+20);ctx.restore();
  };

  const drawActor=(actor,index,time)=>{
    if(!actor.image||!actor.analysis?.valid){drawPending(actor,index);return}
    const [slotX,footY]=slots[index];
    const active=index===selected;
    const targetHeight=active?158:143;
    const texture=stableTexture(actor,targetHeight);
    const transform=actionTransform(index,time);
    const width=texture.width/scale;
    const height=texture.height/scale;
    const x=slotX+transform.dx;
    const y=footY+transform.dy;
    const left=x-width/2;
    const top=y-height;
    actor.hit={x:left-10,y:top-10,w:width+20,h:height+34};
    drawShadow(slotX,footY,width,stageMode==='MAGENTA'?.36:.62);
    if(active){const aura=ctx.createRadialGradient(x,y-height*.48,8,x,y-height*.48,height*.72);aura.addColorStop(0,'rgba(113,239,255,.22)');aura.addColorStop(1,'rgba(113,239,255,0)');ctx.fillStyle=aura;ctx.fillRect(x-height,y-height*1.35,height*2,height*1.55)}
    if(transform.ghost>0){ctx.save();ctx.globalAlpha=transform.ghost*.28;ctx.translate(x-34,y+11);ctx.drawImage(texture.surface,-width/2,-height,width,height);ctx.restore()}
    ctx.save();ctx.translate(x,y);ctx.rotate(transform.rotation);ctx.scale(transform.scaleX,transform.scaleY);ctx.imageSmoothingEnabled=true;ctx.shadowColor='rgba(0,0,0,.82)';ctx.shadowBlur=10;ctx.shadowOffsetY=5;ctx.drawImage(texture.surface,-width/2,-height,width,height);ctx.restore();
    drawSlash(x+width*.34,y-height*.55,transform.slash);
    drawDiagnostics(actor,left,top,width,height);
    const labelY=footY+18;
    ctx.save();ctx.beginPath();ctx.roundRect(slotX-65,labelY,130,25,5);ctx.fillStyle=active?'rgba(19,63,78,.97)':'rgba(4,13,20,.91)';ctx.fill();ctx.strokeStyle=active?'#71efff':'rgba(105,168,192,.36)';ctx.stroke();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=active?'#f1feff':'#c4d5dc';ctx.font=`900 ${active?12:11}px Pretendard,sans-serif`;ctx.fillText(`${String(index+1).padStart(2,'0')} · ${actor.member}`,slotX,labelY+12.5);ctx.restore();
  };

  const drawActionFlash=time=>{
    if(action!=='ATTACK')return {x:0,y:0};
    const local=time-actionStart;
    if(local<180||local>410)return {x:0,y:0};
    const power=1-Math.abs(295-local)/115;
    if(power<=0)return {x:0,y:0};
    if(local<330){ctx.fillStyle=`rgba(223,251,255,${power*.13})`;ctx.fillRect(0,0,DESIGN.width,DESIGN.height)}
    return {x:Math.sin(local*.73)*4*power,y:Math.cos(local*.59)*3*power};
  };

  const render=time=>{
    if(stopped)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    drawBackground();drawArena();
    const shake=drawActionFlash(time);
    ctx.save();ctx.translate(shake.x,shake.y);roster.forEach((actor,index)=>drawActor(actor,index,time));ctx.restore();
    if(action!=='IDLE'){
      const maxDuration=selected<0?(action==='DASH'?1400:1300):(action==='DASH'?880:780);
      if(time-actionStart>maxDuration)setAction('IDLE',false);
    }
    raf=requestAnimationFrame(render);
  };

  const schedule=()=>{if(raf)cancelAnimationFrame(raf);stopped=false;raf=requestAnimationFrame(render)};

  const setAction=(next,restart=true)=>{
    if(!VALID_ACTIONS.has(next))return;
    action=next;
    if(restart)actionStart=performance.now();
    document.querySelectorAll('[data-action]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.action===next)));
  };

  const updateCounters=()=>{
    const ready=roster.filter(actor=>actor.image&&actor.analysis?.valid).length;
    const total=roster.length||manifest?.rosterSnapshot?.expectedCount||21;
    const technical=roster.filter(actor=>actor.image&&actor.analysis?.valid&&actor.analysis.edgeAlphaClear&&actor.analysis.safeMarginPass&&actor.qa?.assetStatus==='TECHNICAL_PASS').length;
    const visualPending=roster.filter(actor=>actor.qa?.visualApproval!==true).length;
    readyCount.textContent=String(ready);
    totalCount.textContent=`/ ${total}`;
    missingCount.textContent=`${technical} / ${total} TECHNICAL · ${visualPending} VISUAL PENDING`;
    loadingCount.textContent=`${ready} / ${total}`;
  };

  const updateSelection=()=>{
    const actor=roster[selected];
    if(!actor){
      selectionOrder.textContent='—';selectionCardId.textContent='카드를 선택해 자산 계약과 알파 상태를 확인하세요';selectionMember.textContent='ZENITH';selectionTitle.textContent='BATTLE UNIT 01—29';selectionPath.textContent='덱·도감은 원본 카드 유지 / SD는 전투엔진에서만 사용';selectionStatus.textContent='—';selectionAlpha.textContent='—';selectionMargin.textContent='—';sourceArtLink.href='#';sourceArtLink.setAttribute('aria-disabled','true');return;
    }
    const analysis=actor.analysis;
    const margins=analysis?.margins;
    selectionOrder.textContent=String(actor.order).padStart(2,'0');
    selectionCardId.textContent=actor.cardId;
    selectionMember.textContent=actor.member;
    selectionTitle.textContent=actor.title;
    selectionPath.textContent=actor.loadedAsset===actor.battleSprite?actor.battleSprite:`${actor.loadedAsset||actor.battleSprite} · PNG MASTER 보존`;
    selectionStatus.textContent=actor.image?`${actor.qa?.assetStatus||'LOADED'} / ${actor.qa?.visualApproval===true?'VISUAL PASS':'VISUAL PENDING'}`:'MISSING';
    selectionAlpha.textContent=analysis?(analysis.hasTransparency&&analysis.edgeAlphaClear?'PASS':'CHECK'):'—';
    selectionMargin.textContent=margins?`${actor.qa?.safeMarginPx??Math.min(margins.left,margins.top,margins.right,margins.bottom)}px ${analysis.safeMarginPass?'PASS':'FAIL'}`:'—';
    sourceArtLink.href=safeAssetUrl(actor.sourceArt);
    sourceArtLink.removeAttribute('aria-disabled');
  };

  const pointerPosition=event=>{
    const rect=canvas.getBoundingClientRect();
    return {x:((event.clientX-rect.left)*(canvas.width/rect.width)-offsetX)/scale,y:((event.clientY-rect.top)*(canvas.height/rect.height)-offsetY)/scale};
  };

  canvas.addEventListener('pointerup',event=>{
    const point=pointerPosition(event);
    let next=-1;
    for(let index=roster.length-1;index>=0;index--){const hit=roster[index].hit;if(hit&&point.x>=hit.x&&point.x<=hit.x+hit.w&&point.y>=hit.y&&point.y<=hit.y+hit.h){next=index;break}}
    selected=next;updateSelection();
  });

  document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{
    const next=button.dataset.stage;if(!VALID_STAGES.has(next))return;stageMode=next;document.querySelectorAll('[data-stage]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.stage===next)));
  }));
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>setAction(button.dataset.action)));
  document.getElementById('toggleBounds').addEventListener('click',event=>{showBounds=!showBounds;event.currentTarget.setAttribute('aria-pressed',String(showBounds))});
  document.getElementById('toggleMargin').addEventListener('click',event=>{showMargin=!showMargin;event.currentTarget.setAttribute('aria-pressed',String(showMargin))});

  const initialize=async()=>{
    try{
      const response=await fetch(MANIFEST_URL,{cache:'no-store'});
      if(!response.ok)throw new Error(`Manifest HTTP ${response.status}`);
      manifest=validateManifest(await response.json());
      roster=manifest.characters.map(entry=>({...entry,image:null,loadedAsset:null,analysis:null,error:null,rasterCache:new Map()}));
      totalCount.textContent=`/ ${roster.length}`;
      manifestScope.textContent=`SCHEMA V${manifest.schemaVersion} · ${manifest.scope} · VISUAL APPROVED`;
      loadingTitle.textContent='ZENITH 전투 스프라이트 검수 중';
      fit();updateCounters();schedule();
      const minimumSafeMargin=manifest.assetContract.minimumSafeMarginPx;
      const alphaThreshold=manifest.assetContract.alphaThreshold;
      const tasks=[loadImage(BACKGROUND_URL).then(image=>{background=image}).catch(()=>null),...roster.map(async actor=>{
        try{
          const loaded=await loadActorImage(actor);
          actor.image=loaded.image;
          actor.loadedAsset=loaded.path;
          const sourceScale=Math.min(actor.image.naturalWidth/actor.canvas.width,actor.image.naturalHeight/actor.canvas.height);
          actor.analysis=analyzeAlpha(actor.image,alphaThreshold,minimumSafeMargin*sourceScale);
          if(!actor.analysis.valid)throw new Error('No visible alpha pixels');
        }catch(error){actor.image=null;actor.analysis=null;actor.error=error instanceof Error?error.message:String(error)}
        updateCounters();
        if(selected>=0&&roster[selected]===actor)updateSelection();
      })];
      await Promise.allSettled(tasks);
      loading.classList.add('is-hidden');
      updateCounters();
    }catch(error){
      console.error(error);
      loading.classList.add('is-error');
      loadingTitle.textContent='ZENITH manifest를 불러오지 못했습니다';
      loadingCount.textContent=error instanceof Error?error.message:'Unknown manifest error';
    }
  };

  addEventListener('resize',()=>{fit()},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopped=true;if(raf)cancelAnimationFrame(raf);raf=0}else schedule()});
  initialize();
})();
