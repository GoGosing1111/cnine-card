(()=>{
  'use strict';
  const DESIGN={width:1600,height:760};
  const TILE={width:250,height:104};
  const root=document.getElementById('battleStage');
  const canvas=document.getElementById('battleCanvas');
  const ctx=canvas.getContext('2d',{alpha:false});
  const loading=document.getElementById('loading');
  const loadingCount=document.getElementById('loadingCount');
  const selection=document.getElementById('selection');
  const manifestUrl='../../assets/ui/project-v/characters/prestige/manifest-v1.json?v=2-full-roster';
  const PAGE_SIZE=12;
  let roster=[];
  const slots=[
    [410,276],[670,276],[930,276],[1190,276],
    [540,472],[800,472],[1060,472],[1320,472],
    [410,668],[670,668],[930,668],[1190,668]
  ];
  let scale=1,offsetX=0,offsetY=0,selected=-1,page=0,showGrid=true,motion=true,loaded=0,raf=0;
  let background=null;
  const pageActors=()=>roster.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const pageCount=()=>Math.max(1,Math.ceil(roster.length/PAGE_SIZE));
  const updatePageLabel=()=>{selection.innerHTML=`<small>${page+1} / ${pageCount()} 페이지 · 캐릭터를 선택하면 확대 표시됩니다</small><b>PRESTIGE SD ${roster.length}인 전체 연결</b>`};

  const loadImage=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
  const alphaBounds=image=>{
    const probe=document.createElement('canvas');probe.width=image.naturalWidth;probe.height=image.naturalHeight;
    const pctx=probe.getContext('2d',{willReadFrequently:true});pctx.drawImage(image,0,0);
    const data=pctx.getImageData(0,0,probe.width,probe.height).data;
    let minX=probe.width,minY=probe.height,maxX=-1,maxY=-1;
    for(let y=0;y<probe.height;y+=2){for(let x=0;x<probe.width;x+=2){if(data[(y*probe.width+x)*4+3]>18){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}}
    return maxX<0?{x:0,y:0,w:probe.width,h:probe.height}:{x:Math.max(0,minX-4),y:Math.max(0,minY-4),w:Math.min(probe.width-1,maxX+4)-Math.max(0,minX-4)+1,h:Math.min(probe.height-1,maxY+4)-Math.max(0,minY-4)+1};
  };
  const stableTexture=(actor,targetH)=>{
    actor.rasterCache||=new Map();
    const height=Math.max(1,Math.round(targetH*scale));
    const width=Math.max(1,Math.round(height*(actor.bounds.w/actor.bounds.h)));
    const key=`${width}x${height}`;
    if(actor.rasterCache.has(key))return actor.rasterCache.get(key);
    const surface=document.createElement('canvas');surface.width=width;surface.height=height;
    const sctx=surface.getContext('2d',{alpha:true});
    sctx.imageSmoothingEnabled=true;sctx.imageSmoothingQuality='high';
    sctx.drawImage(actor.image,actor.bounds.x,actor.bounds.y,actor.bounds.w,actor.bounds.h,0,0,width,height);
    const texture={surface,width,height};actor.rasterCache.set(key,texture);return texture;
  };
  const fit=()=>{
    const rect=root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;
    scale=Math.min(canvas.width/DESIGN.width,canvas.height/DESIGN.height);
    offsetX=(canvas.width-DESIGN.width*scale)/2;offsetY=(canvas.height-DESIGN.height*scale)/2;
    ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
  };
  const diamond=(x,y,w,h,fill,stroke,glow=0)=>{
    ctx.save();ctx.beginPath();ctx.moveTo(x,y-h/2);ctx.lineTo(x+w/2,y);ctx.lineTo(x,y+h/2);ctx.lineTo(x-w/2,y);ctx.closePath();
    ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.4;if(glow){ctx.shadowColor=stroke;ctx.shadowBlur=glow}ctx.stroke();ctx.restore();
  };
  const rounded=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
  const drawBackground=()=>{
    if(background){
      const iw=background.naturalWidth,ih=background.naturalHeight,s=Math.max(DESIGN.width/iw,DESIGN.height/ih),dw=iw*s,dh=ih*s;
      ctx.drawImage(background,(DESIGN.width-dw)/2,(DESIGN.height-dh)/2,dw,dh);
    }else{ctx.fillStyle='#07111b';ctx.fillRect(0,0,DESIGN.width,DESIGN.height)}
    const g=ctx.createLinearGradient(0,0,0,DESIGN.height);g.addColorStop(0,'rgba(2,8,14,.54)');g.addColorStop(.34,'rgba(3,13,21,.2)');g.addColorStop(1,'rgba(1,5,10,.76)');ctx.fillStyle=g;ctx.fillRect(0,0,DESIGN.width,DESIGN.height);
    const r=ctx.createRadialGradient(800,440,80,800,440,760);r.addColorStop(0,'rgba(32,119,151,.16)');r.addColorStop(.55,'rgba(2,9,15,.08)');r.addColorStop(1,'rgba(0,0,0,.66)');ctx.fillStyle=r;ctx.fillRect(0,0,DESIGN.width,DESIGN.height);
  };
  const drawArena=()=>{
    const floor=ctx.createLinearGradient(0,180,0,740);floor.addColorStop(0,'rgba(25,49,64,.2)');floor.addColorStop(1,'rgba(5,14,22,.72)');
    ctx.beginPath();ctx.moveTo(800,112);ctx.lineTo(1535,396);ctx.lineTo(800,744);ctx.lineTo(65,396);ctx.closePath();ctx.fillStyle=floor;ctx.fill();ctx.strokeStyle='rgba(105,176,207,.2)';ctx.stroke();
    if(!showGrid)return;
    slots.forEach(([x,y],index)=>{
      const active=index===selected;
      diamond(x,y,TILE.width,TILE.height,active?'rgba(91,202,238,.2)':'rgba(16,47,64,.34)',active?'rgba(111,231,255,.95)':'rgba(89,151,181,.34)',active?15:0);
      diamond(x,y,TILE.width-16,TILE.height-8,'rgba(7,21,31,.24)',active?'rgba(178,245,255,.5)':'rgba(119,170,194,.14)');
    });
  };
  const drawActor=(actor,index,time)=>{
    if(!actor.image||!actor.bounds)return;
    const [x,footY]=slots[index],active=index===selected;
    const targetH=active?222:196;
    const h=targetH,w=h*(actor.bounds.w/actor.bounds.h),drawX=x-w/2,drawY=footY-h;
    actor.hit={x:drawX-10,y:drawY-12,w:w+20,h:h+28};
    const texture=stableTexture(actor,targetH);
    const xPx=Math.round(offsetX+x*scale),footPx=Math.round(offsetY+footY*scale);
    const bobPx=motion?Math.round(Math.sin(time*.0024+index*.73)*2):0;
    const leftPx=Math.round(xPx-texture.width/2),topPx=footPx-texture.height+bobPx;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha=.62;ctx.filter=`blur(${Math.max(2,Math.round(5*scale))}px)`;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(xPx,footPx+Math.round(4*scale),Math.max(Math.round(30*scale),Math.round(texture.width*.31)),Math.max(3,Math.round(10*scale)),0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(active){
      ctx.save();ctx.setTransform(1,0,0,1,0,0);const auraY=footPx-Math.round(texture.height*.45),radius=Math.round(texture.height*.62);
      const aura=ctx.createRadialGradient(xPx,auraY,10,xPx,auraY,radius);aura.addColorStop(0,'rgba(99,226,255,.22)');aura.addColorStop(1,'rgba(99,226,255,0)');ctx.fillStyle=aura;ctx.fillRect(xPx-radius,auraY-radius,radius*2,radius*2);ctx.restore();
    }
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=Math.round(10*scale);ctx.shadowOffsetY=Math.round(5*scale);ctx.drawImage(texture.surface,leftPx,topPx);ctx.restore();
    const labelW=Math.round((active?126:108)*scale),labelH=Math.round(27*scale),labelY=footPx+Math.round(20*scale);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.roundRect(xPx-labelW/2,labelY,labelW,labelH,Math.max(3,Math.round(5*scale)));ctx.fillStyle=active?'rgba(19,68,87,.96)':'rgba(5,13,20,.9)';ctx.fill();ctx.strokeStyle=active?'#71e4ff':'rgba(110,155,179,.4)';ctx.lineWidth=Math.max(1,Math.round(scale));ctx.stroke();ctx.fillStyle=active?'#f0fdff':'#c2d1d9';ctx.font=`800 ${Math.max(11,Math.round((active?14:12)*scale))}px Pretendard, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(actor.name,xPx,labelY+labelH/2);ctx.restore();
  };
  const render=time=>{
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    drawBackground();drawArena();pageActors().forEach((actor,index)=>drawActor(actor,index,time));
    raf=motion?requestAnimationFrame(render):0;
  };
  const schedule=()=>{if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(render)};
  const pointer=(event)=>{const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*(canvas.width/rect.width)/scale-offsetX/scale,y:(event.clientY-rect.top)*(canvas.height/rect.height)/scale-offsetY/scale}};
  canvas.addEventListener('pointerup',event=>{
    const point=pointer(event);let next=-1;
    const actors=pageActors();for(let i=actors.length-1;i>=0;i--){const h=actors[i].hit;if(h&&point.x>=h.x&&point.x<=h.x+h.w&&point.y>=h.y&&point.y<=h.y+h.h){next=i;break}}
    selected=next;if(next>=0)selection.innerHTML=`<small>PRESTIGE · 전투 전용 단일 SD 스프라이트</small><b>${actors[next].name}</b>`;else updatePageLabel();schedule();
  });
  const movePage=delta=>{page=(page+delta+pageCount())%pageCount();selected=-1;updatePageLabel();schedule()};
  document.getElementById('pagePrev').addEventListener('click',()=>movePage(-1));
  document.getElementById('pageNext').addEventListener('click',()=>movePage(1));
  document.getElementById('toggleGrid').addEventListener('click',event=>{showGrid=!showGrid;event.currentTarget.setAttribute('aria-pressed',String(showGrid));event.currentTarget.textContent=`타일 가이드 ${showGrid?'ON':'OFF'}`;schedule()});
  document.getElementById('toggleMotion').addEventListener('click',event=>{motion=!motion;event.currentTarget.setAttribute('aria-pressed',String(motion));event.currentTarget.textContent=`대기 모션 ${motion?'ON':'OFF'}`;schedule()});
  fetch(manifestUrl,{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);return response.json()}).then(manifest=>{
    roster=manifest.characters.map(entry=>({name:entry.member||entry.title,cardId:entry.cardId,file:`../../${entry.battleSprite}?v=${entry.sha256.slice(0,16)}`}));
    document.getElementById('rosterCount').textContent=String(roster.length);updatePageLabel();
    return Promise.all([
      loadImage('../../assets/ui/idle-dungeon/moon-citadel-v1.png').then(image=>{background=image}).catch(()=>null),
      ...roster.map(actor=>loadImage(actor.file).then(image=>{actor.image=image;actor.bounds=alphaBounds(image);loaded++;loadingCount.textContent=`${loaded} / ${roster.length}`}))
    ]);
  }).then(()=>{fit();loading.classList.add('is-hidden');schedule()}).catch(error=>{console.error(error);loading.querySelector('b').textContent='일부 SD 리소스를 불러오지 못했습니다'});
  addEventListener('resize',()=>{fit();schedule()},{passive:true});
})();
