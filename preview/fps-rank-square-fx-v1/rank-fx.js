(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const LOOP = 6;
  const frac = n => ((n % 1) + 1) % 1;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  const ranks = [
    {code:'colonel',name:'대령',rect:[238,655,196,196],color:[182,127,255],hot:[239,217,255],trails:1,motes:3,power:.54,description:'보랏빛 테두리 순환 · 은빛 문양 광택',points:[[.50,.30],[.28,.67],[.71,.67]]},
    {code:'brigadier',name:'준장',rect:[455,655,196,196],color:[255,155,52],hot:[255,239,183],trails:2,motes:5,power:.68,description:'금빛 이중 궤적 · 별빛 점화',points:[[.50,.46]]},
    {code:'major-general',name:'소장',rect:[671,655,196,196],color:[255,174,65],hot:[255,245,201],trails:2,motes:9,power:.82,description:'교차 광원 · 두 별의 연속 반짝임',points:[[.29,.30],[.67,.69]]},
    {code:'lieutenant-general',name:'중장',rect:[887,655,196,196],color:[255,175,82],hot:[255,247,221],trails:3,motes:14,power:1.02,description:'삼중 궤적 · 모서리 전류 · 금빛 입자',points:[[.50,.28],[.27,.67],[.72,.67]]},
    {code:'general',name:'대장',rect:[1104,655,196,196],color:[255,199,93],hot:[255,251,224],trails:4,motes:20,power:1.22,description:'이중 광원 테두리 · 사성 연쇄 광채',points:[[.29,.30],[.70,.30],[.29,.70],[.70,.70]]},
    {code:'marshal',name:'원수',rect:[1320,655,196,196],color:[255,220,130],hot:[255,255,244],trails:5,motes:30,power:1.5,description:'오성 연쇄 점등 · 백금 광채 · 황금 입자',points:[[.27,.27],[.73,.27],[.50,.50],[.27,.73],[.73,.73]]}
  ];
  let atlas;
  const bases = [], masks = [], shines = [];
  function canvas(w=256,h=256){ const c=document.createElement('canvas');c.width=w;c.height=h;return c; }
  function pointOnFrame(t,inset=8){
    const d=256-inset*2, q=frac(t)*4;
    if(q<1)return [inset+q*d,inset];
    if(q<2)return [256-inset,inset+(q-1)*d];
    if(q<3)return [256-inset-(q-2)*d,256-inset];
    return [inset,256-inset-(q-3)*d];
  }
  function glow(ctx,x,y,r,color,alpha){
    if(alpha<.003)return;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba(color,alpha));g.addColorStop(.22,rgba(color,alpha*.48));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function glint(ctx,x,y,r,color,alpha){
    if(alpha<.015)return;
    glow(ctx,x,y,r*2.5,color,alpha*.35);
    ctx.fillStyle=rgba([255,255,242],alpha);
    ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r*.11,y-r*.12);ctx.lineTo(x+r,y);ctx.lineTo(x+r*.11,y+r*.12);ctx.lineTo(x,y+r);ctx.lineTo(x-r*.11,y+r*.12);ctx.lineTo(x-r,y);ctx.lineTo(x-r*.11,y-r*.12);ctx.closePath();ctx.fill();
    ctx.fillStyle=rgba(color,alpha*.8);ctx.fillRect(x-.8,y-.8,1.6,1.6);
  }
  function comet(ctx,t,inset,length,r,level){
    const n=46;
    for(let j=n;j>=0;j--){
      const age=j/n, p=pointOnFrame(t-age*length,inset), p2=pointOnFrame(t-(j+1)/n*length,inset);
      const a=(1-age)**2*r.power*.7;
      ctx.strokeStyle=rgba(r.color,a*.34);ctx.lineWidth=6+level*.65;
      ctx.beginPath();ctx.moveTo(...p2);ctx.lineTo(...p);ctx.stroke();
      ctx.strokeStyle=rgba(j<7?r.hot:r.color,a);ctx.lineWidth=1.35+level*.13;
      ctx.beginPath();ctx.moveTo(...p2);ctx.lineTo(...p);ctx.stroke();
    }
    const p=pointOnFrame(t,inset);
    glow(ctx,...p,12+level*1.8,r.color,.6*r.power);
    glint(ctx,...p,3.6+level*.65,r.hot,.85);
  }
  function metalShine(ctx,time,index){
    const r=ranks[index],c=shines[index],s=c.getContext('2d');
    s.clearRect(0,0,256,256);
    const u=frac(time/LOOP*(index>=4?2:1)+index*.09);
    const x=-150+u*550;
    const g=s.createLinearGradient(x-30,0,x+45,0);
    g.addColorStop(0,'transparent');g.addColorStop(.35,rgba(r.color,.14));g.addColorStop(.52,rgba(r.hot,.43+index*.04));g.addColorStop(.68,rgba(r.color,.11));g.addColorStop(1,'transparent');
    s.save();s.transform(1,0,-.5,1,64,0);s.fillStyle=g;s.fillRect(x-35,0,90,256);s.restore();
    s.globalCompositeOperation='destination-in';s.drawImage(masks[index],0,0);s.globalCompositeOperation='source-over';
    ctx.drawImage(c,0,0);
  }
  function electricCorners(ctx,t,r,index){
    if(index<3)return;
    const p=frac(t/LOOP*2+index*.08), wave=Math.max(0,Math.sin(p*TAU))**8;
    ctx.strokeStyle=rgba(r.hot,wave*(.24+.07*index));ctx.lineWidth=1.1;
    for(let k=0;k<4;k++){
      ctx.save();ctx.translate(128,128);ctx.rotate(k*Math.PI/2);ctx.translate(-128,-128);
      ctx.beginPath();ctx.moveTo(17,57);ctx.lineTo(20,45);ctx.lineTo(16,37);ctx.lineTo(21,28);ctx.lineTo(26,28);ctx.lineTo(28,21);ctx.lineTo(37,17);ctx.lineTo(47,20);ctx.lineTo(59,17);ctx.stroke();ctx.restore();
    }
  }
  function innerRays(ctx,t,r,index){
    if(index<4)return;
    ctx.save();ctx.beginPath();ctx.rect(29,29,198,198);ctx.clip();
    const ring=index===5?20:10;
    const pulse=.55+.45*Math.sin(TAU*t/LOOP*2);
    for(let j=0;j<ring;j++){
      const a=TAU*(j/ring+t/LOOP*(index===5?1:-1));
      const x=128+Math.cos(a)*65,y=128+Math.sin(a)*65;
      const ex=128+Math.cos(a)*140,ey=128+Math.sin(a)*140;
      const grad=ctx.createLinearGradient(x,y,ex,ey);
      grad.addColorStop(0,rgba(r.color,0));grad.addColorStop(.7,rgba(r.color,(index===5?.10:.045)*pulse));grad.addColorStop(1,rgba(r.color,0));
      ctx.strokeStyle=grad;ctx.lineWidth=j%3===0?2:1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
    }
    ctx.restore();
  }
  function drawFx(ctx,time,index){
    const r=ranks[index], t=frac(time/LOOP)*LOOP;
    ctx.save();ctx.beginPath();ctx.rect(1,1,254,254);ctx.clip();ctx.globalCompositeOperation='screen';ctx.lineCap='round';
    const phase=t/LOOP;
    innerRays(ctx,t,r,index);
    for(let k=0;k<r.trails;k++){
      const inset=k>=2?19:8;
      const direction=k%2===0?1:-1;
      comet(ctx,phase*(index===5?2:1)*direction+k/r.trails+index*.07,inset,.095+index*.018,r,index);
    }
    metalShine(ctx,t,index);
    electricCorners(ctx,t,r,index);
    for(let k=0;k<r.motes;k++){
      const u=frac(phase*(index>=4?2:1)+k*.61803398875);
      const edge=k%2===0?1:-1;
      const x=128+edge*(72+Math.sin(k*2.71)*30)+Math.sin(TAU*(u+k*.17))*7;
      const y=225-u*192;
      const a=Math.sin(Math.PI*u)**2*(.28+index*.07);
      glow(ctx,x,y,3+index*.25,r.color,a*.4);
      ctx.fillStyle=rgba(k%3?r.color:r.hot,a);
      const radius=.65+(k%3)*.25;
      ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.fill();
      if(index>=3&&k%5===0)glint(ctx,x,y,3.5,r.hot,a*.75);
    }
    r.points.forEach((p,k)=>{
      const u=frac(phase*(index>=4?2:1)-k/(r.points.length+2)+index*.073);
      const a=Math.max(0,Math.cos((u-.12)*TAU))**14;
      glint(ctx,p[0]*256-4,p[1]*256-8,4+index*.85,r.hot,a*(.45+index*.1));
    });
    if(index===5){
      const burst=Math.max(0,Math.sin(TAU*phase-1))**12;
      const pulse=Math.sin(phase*TAU*2)**2;
      [[13,13],[243,13],[243,243],[13,243]].forEach((p,k)=>glint(ctx,...p,7+burst*5,r.hot,.45+pulse*.35));
      glint(ctx,128,119,8+burst*14,r.hot,burst*.9);
      ctx.strokeStyle=rgba(r.color,.08+burst*.12);ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(30,30);ctx.lineTo(226,30);ctx.lineTo(226,226);ctx.lineTo(30,226);ctx.closePath();ctx.stroke();
    }
    ctx.restore();
  }
  async function init(src){
    atlas=new Image();atlas.src=src;await atlas.decode();
    ranks.forEach(r=>{
      const b=canvas(),c=b.getContext('2d',{willReadFrequently:true});c.drawImage(atlas,...r.rect,0,0,256,256);bases.push(b);
      const m=canvas(),mc=m.getContext('2d'),pixels=c.getImageData(0,0,256,256);
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        const o=(y*256+x)*4,red=pixels.data[o],green=pixels.data[o+1],blue=pixels.data[o+2];
        const metal=(red>125&&green>90&&red>blue*1.1)||(red>163&&green>155&&blue>145);
        pixels.data[o]=pixels.data[o+1]=pixels.data[o+2]=255;
        pixels.data[o+3]=x>30&&x<226&&y>30&&y<226&&metal?255:0;
      }
      mc.putImageData(pixels,0,0);masks.push(m);shines.push(canvas());
    });
  }
  function drawIcon(ctx,index,time,size=256,enabled=true){
    ctx.save();ctx.scale(size/256,size/256);ctx.drawImage(bases[index],0,0);if(enabled)drawFx(ctx,time,index);ctx.restore();
  }
  function drawChart(ctx,time,enabled=true){
    ctx.clearRect(0,0,1536,1024);ctx.drawImage(atlas,0,0);
    if(enabled)ranks.forEach((r,i)=>{ctx.save();ctx.translate(r.rect[0],r.rect[1]);ctx.scale(r.rect[2]/256,r.rect[3]/256);drawFx(ctx,time,i);ctx.restore();});
  }
  function drawComparison(ctx,time,width=1020,height=690,enabled=true){
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#07111e';ctx.fillRect(0,0,width,height);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f3e4bb';ctx.font='700 28px "Malgun Gothic", sans-serif';ctx.fillText('대령 → 원수 · 계급별 이펙트',width/2,32);
    const size=238,gap=(width-size*3)/4;
    ranks.forEach((r,i)=>{
      const x=gap+(i%3)*(size+gap),y=72+Math.floor(i/3)*300;
      ctx.save();ctx.translate(x,y);drawIcon(ctx,i,time,size,enabled);ctx.restore();
      ctx.font='700 25px "Malgun Gothic", sans-serif';ctx.fillStyle='#f7f1e6';ctx.fillText(r.name,x+size/2,y+264);
    });
  }
  window.RankFX={ranks,LOOP,init,drawFx,drawIcon,drawChart,drawComparison};
})();
