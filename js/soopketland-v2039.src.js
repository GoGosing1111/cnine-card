import {Application,Assets,Container,Graphics,Sprite,Text} from 'pixi.js';
import {gsap} from 'gsap';

const HYPER='SOOPKETLAND_HYPER_BURNING_TICKET';
const ART='/assets/ui/soopketland/cabinet-v1.webp';
const FONT='Pretendard, Noto Sans KR, Arial, sans-serif';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n||0).toLocaleString('ko-KR');
const prizeAmount=p=>p.key===HYPER?'×15 · 60분':p.key==='COIN'?`${num(p.amount/100000000)}억 코인`:`${num(p.amount)}${p.key.endsWith('_CARD')?'장':'개'}`;
const SFX={launch:'/assets/sfx/v3-role-impact-v2/speed.mp3',stop:'/assets/sfx/v3-role-impact-v2/defense.mp3',win:'/assets/sfx/v3-advancement-awakening-v1/shatter-advancement-v1.mp3'};
const circle=(x,y,r,color,alpha=1)=>new Graphics().circle(x,y,r).fill({color,alpha});
function text(label,size,color=0xf8e7c0){return new Text({text:label,style:{fontFamily:FONT,fontSize:size,fontWeight:'700',fill:color,align:'center'}})}
function centered(parent,label,x,y,size,color){const t=text(label,size,color);t.anchor.set(.5);t.position.set(x,y);parent.addChild(t);return t}

// One renderer is used by the isolated preview and production. This class has no
// reward API, RNG weights, inventory mutation or authority to issue coupons.
export class PachinkoStage{
  constructor(host,prizes){this.host=host;this.prizes=prizes;this.dead=false;this.balls=[];this.dust=[];this.reels=[];this.pins=[];this.audio=new Set();this.soundOn=false;this.frame=0;this.time=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.onVisibility=()=>{if(document.hidden)this.finishShow?.()};document.addEventListener('visibilitychange',this.onVisibility)}
  async init(){
    const app=new Application();this.app=app;
    await app.init({width:768,height:1152,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,powerPreference:'low-power'});
    if(this.dead){app.destroy(true,{children:true});return}
    this.host.replaceChildren(app.canvas);app.canvas.setAttribute('aria-label','구슬 충돌과 3개 릴이 움직이는 숲켓랜드 기계');app.canvas.setAttribute('role','img');
    const root=this.root=new Container();app.stage.addChild(root);
    const texture=await Assets.load(ART);if(this.dead)return;
    const cabinet=new Sprite(texture);cabinet.width=768;cabinet.height=1152;root.addChild(cabinet);
    const stage=this.playfield=new Container();root.addChild(stage);
    // A physical board: staggered steel pins, a gold landing gate and glass reels.
    const rail=new Graphics().roundRect(112,220,544,657,148).stroke({color:0xdca34d,width:2,alpha:.48}).roundRect(133,248,502,600,128).stroke({color:0xa77034,width:1,alpha:.2});stage.addChild(rail);
    centered(stage,'SOOPKET LAND',384,235,25,0xf5dab0).style.letterSpacing=6;
    this.status=centered(stage,'STREAMER  /  EVENT MACHINE',384,276,12,0xaca596);
    for(let row=0;row<8;row++)for(let col=0;col<(row%2?7:8);col++){
      const x=180+col*57+(row%2?28:0),y=330+row*32;
      const pin=new Container();pin.position.set(x,y);pin.addChild(circle(0,2,6,0x020403),circle(0,0,4.5,0x9c957b),circle(-1.5,-1.5,1.5,0xffefcf));stage.addChild(pin);this.pins.push({x,y,node:pin});
    }
    const gate=new Graphics().moveTo(292,597).lineTo(342,620).lineTo(426,620).lineTo(476,597).stroke({color:0xe5bd71,width:5});stage.addChild(gate);
    this.gateGlow=circle(384,612,22,0xffc67d,.15);stage.addChild(this.gateGlow);
    centered(stage,'START',384,636,12,0xe5bd71).style.letterSpacing=5;
    this.ballLayer=new Container();stage.addChild(this.ballLayer);
    this.fx=new Container();root.addChild(this.fx);
    this.resultLabel=centered(stage,'OWNER EVENT PASS',384,856,17,0xf0d69c);
    this.amountLabel=centered(stage,'이용권을 넣고 방송을 시작하세요',384,884,13,0xb6ad9d);
    for(let i=0;i<3;i++)this.makeReel(224+i*160,743,i);
    this.plaque=centered(root,'PLAY TOGETHER',381,1025,17,0x20180c);this.plaque.style.letterSpacing=3;
    this.launchRing=new Graphics().circle(625,1040,38).stroke({color:0xf3c97e,width:2});root.addChild(this.launchRing);
    this.launchRing.eventMode='static';this.launchRing.cursor='pointer';this.launchRing.on('pointertap',()=>this.host.closest('.sl-layout')?.querySelector('[data-sl-play]')?.click());
    centered(root,'START',625,1040,13,0xf9da9c);
    this.readyToPlay=true;app.ticker.add(t=>this.update(Math.min(t.deltaMS/1000,.04)));
  }
  makeReel(x,y,index){
    const reel=new Container();reel.position.set(x,y);this.playfield.addChild(reel);
    reel.addChild(new Graphics().roundRect(-73,-91,146,180,16).fill(0x030609).stroke({color:0xab8753,width:2}));
    reel.addChild(new Graphics().roundRect(-66,-83,132,164,12).fill(0x14191f).stroke({color:0x494239,width:1}));
    const holder=new Container(),mask=new Graphics().rect(-61,-77,122,152).fill(0xffffff);reel.addChild(holder,mask);holder.mask=mask;
    const symbols=[];
    for(let i=-1;i<=1;i++){const s=this.symbol(this.prizes[(index+i+this.prizes.length)%this.prizes.length]);s.y=i*132;holder.addChild(s);symbols.push(s)}
    reel.addChild(new Graphics().rect(-61,-77,122,17).fill({color:0x000000,alpha:.55}).rect(-61,60,122,16).fill({color:0x000000,alpha:.55}));
    reel.addChild(new Graphics().moveTo(-77,0).lineTo(-61,0).moveTo(61,0).lineTo(77,0).stroke({color:0xffdb9b,width:3}));
    this.reels.push({node:reel,holder,symbols,spinning:false,index,phase:0,speed:1700});
  }
  symbol(prize){
    const node=new Container(),color=prize.color||0xf1cf83;
    node.addChild(circle(0,0,43,0x090d11),new Graphics().circle(0,0,42).stroke({color,width:2}).circle(0,0,36).stroke({color,width:1,alpha:.3}));
    const crest=new Graphics().moveTo(-29,26).lineTo(-37,-13).lineTo(-17,-3).lineTo(0,-31).lineTo(17,-3).lineTo(37,-13).lineTo(29,26).stroke({color,width:2,alpha:.42});node.addChild(crest);
    centered(node,prize.symbol,0,-2,prize.symbol==='15'?38:48,color);
    return node;
  }
  sound(key,gain=.6){
    if(!this.soundOn||this.dead)return;
    const a=new Audio(SFX[key]);a.volume=Math.min(.1,.1*gain);this.audio.add(a);
    const clear=()=>this.audio.delete(a);a.addEventListener('ended',clear,{once:true});a.addEventListener('error',clear,{once:true});a.play().catch(clear);
  }
  particles(x,y,color,count=24){
    if(this.dead||this.reduced)return;
    for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,speed=80+Math.random()*310,life=.45+Math.random()*.8,g=new Graphics().roundRect(-1,-4,2+Math.random()*2,6+Math.random()*7,1).fill(color);g.position.set(x,y);g.rotation=angle;this.fx.addChild(g);this.dust.push({g,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life})}
  }
  launchBall(index){
    if(this.dead)return;
    const node=new Container();node.addChild(circle(1,3,10,0x000000,.5),circle(0,0,8,0x867866),circle(-1,-2,6,0xe2e1d5),circle(-3,-4,3,0xffffff));node.position.set(622,970);this.ballLayer.addChild(node);
    const ball={node,x:622,y:970,vx:0,vy:0,age:0,falling:false};this.balls.push(ball);
    this.timeline.to(ball,{x:610,y:305,duration:.36,ease:'power3.out'},index*.16);
    this.timeline.to(ball,{x:310+index*17,y:300,duration:.24,ease:'power1.in',onComplete:()=>{ball.falling=true;ball.vx=(index%2?-1:1)*75;ball.vy=100}},index*.16+.36);
  }
  update(dt){
    if(this.dead||!this.root)return;this.time+=dt;
    this.launchRing.alpha=.65+Math.sin(this.time*2)*.3;
    for(const ball of [...this.balls]){
      ball.age+=dt;
      if(ball.falling){
        // Two small fixed substeps keep fast steel-ball collisions stable on mobile.
        for(let n=0;n<2;n++){
          const d=dt/2;ball.vy+=650*d;ball.x+=ball.vx*d;ball.y+=ball.vy*d;
          if(ball.x<155||ball.x>613){ball.x=Math.max(155,Math.min(613,ball.x));ball.vx*=-.75}
          for(const pin of this.pins){const dx=ball.x-pin.x,dy=ball.y-pin.y,distance=Math.hypot(dx,dy);if(distance<12&&distance>.01){const nx=dx/distance,ny=dy/distance,dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=1.65*dot*nx;ball.vy-=1.65*dot*ny;ball.x=pin.x+nx*12;ball.y=pin.y+ny*12;pin.node.alpha=.6;this.particles(pin.x,pin.y,0xf7c983,3)}}}
        }
        if(ball.y>582){ball.x+=(384-ball.x)*dt*5;if(ball.y>622){this.particles(384,612,0xffd289,12);this.removeBall(ball);continue}}
        if(ball.age>5){this.removeBall(ball);continue}
      }
      ball.node.position.set(ball.x,ball.y);
    }
    this.pins.forEach(p=>{p.node.alpha=Math.min(1,p.node.alpha+dt*4)});
    for(const reel of this.reels)if(reel.spinning){reel.phase+=dt*reel.speed;reel.holder.y=reel.phase%132;if(reel.phase>=132){reel.phase%=132;const first=reel.symbols.shift();first.destroy({children:true});const symbol=this.symbol(this.prizes[(++reel.index)%this.prizes.length]);reel.holder.addChild(symbol);reel.symbols.push(symbol);reel.symbols.forEach((s,i)=>s.y=(i-2)*132)}}
    for(const p of [...this.dust]){p.life-=dt;if(p.life<=0){this.fx.removeChild(p.g);p.g.destroy();this.dust.splice(this.dust.indexOf(p),1);continue}p.vy+=130*dt;p.g.x+=p.vx*dt;p.g.y+=p.vy*dt;p.g.alpha=p.life/p.max;p.g.rotation+=dt*2}
  }
  removeBall(ball){ball.node.destroy({children:true});this.balls.splice(this.balls.indexOf(ball),1)}
  ceremony(prize){
    if(this.crown){gsap.killTweensOf(this.crown);gsap.killTweensOf(this.crown.scale);this.crown.destroy({children:true})}
    const box=this.crown=new Container();box.position.set(384,455);this.fx.addChild(box);
    const color=prize.jackpot?0xffd894:prize.color;
    const rays=new Graphics();
    for(let i=0;i<32;i++){const angle=i*Math.PI/16,r=i%2?158:182;rays.moveTo(Math.cos(angle)*108,Math.sin(angle)*65).lineTo(Math.cos(angle)*r,Math.sin(angle)*r*.7).stroke({color,width:i%2?1:2,alpha:i%2?.28:.65})}
    box.addChild(rays,new Graphics().roundRect(-233,-80,466,167,12).fill({color:0x090c10,alpha:.94}).stroke({color,width:2,alpha:.85}));
    box.addChild(new Graphics().moveTo(-241,-42).lineTo(-261,-62).lineTo(-258,-16).lineTo(-237,9).moveTo(241,-42).lineTo(261,-62).lineTo(258,-16).lineTo(237,9).stroke({color,width:5,alpha:.75}));
    centered(box,prize.jackpot?'JACKPOT':'WIN',0,-38,prize.jackpot?57:65,color).style.letterSpacing=5;
    centered(box,prize.label,0,15,23,0xf7ecdb);centered(box,prizeAmount(prize),0,53,31,color);
    return box;
  }
  stopReel(index,prize,animate=true){
    const reel=this.reels[index];if(!reel)return;reel.spinning=false;reel.phase=0;reel.holder.y=0;
    for(const child of reel.holder.removeChildren()){gsap.killTweensOf(child);child.destroy({children:true})}
    const symbol=this.symbol(prize);reel.holder.addChild(symbol);reel.symbols=[symbol];
    if(animate&&!this.reduced){symbol.y=-22;gsap.to(symbol,{y:0,duration:.36,ease:'back.out(2)'});this.particles(reel.node.x,reel.node.y,prize.color,18);this.sound('stop',.25)}
  }
  play(result){
    this.finishShow?.();if(this.dead||!this.readyToPlay)return Promise.resolve();
    const prize=result.prize;if(this.crown){gsap.killTweensOf(this.crown);gsap.killTweensOf(this.crown.scale);this.crown.destroy({children:true});this.crown=null}this.status.text='BALL IN PLAY';this.resultLabel.text='구슬이 들어가면 릴이 가동됩니다';this.amountLabel.text='당첨 결과는 서버에 안전하게 저장되었습니다';
    if(this.reduced||document.hidden){this.reels.forEach((r,i)=>this.stopReel(i,prize,false));this.resultLabel.text=prize.label;this.amountLabel.text=prizeAmount(prize);return Promise.resolve()}
    return new Promise(resolve=>{
      let complete=false;
      const finish=()=>{if(complete)return;complete=true;clearTimeout(this.watchdog);this.timeline?.kill();this.timeline=null;this.reels.forEach((r,i)=>this.stopReel(i,prize,false));this.balls.slice().forEach(b=>this.removeBall(b));this.status.text=result.code?'VIEWER COUPON ISSUED':'INVENTORY DELIVERED';this.resultLabel.text=prize.label;this.amountLabel.text=prizeAmount(prize);this.root.position.set(0);this.ceremony(prize);this.finishShow=null;resolve()};
      this.finishShow=finish;this.watchdog=setTimeout(finish,12000);
      const tl=this.timeline=gsap.timeline({onComplete:finish});this.sound('launch',.45);
      for(let i=0;i<7;i++)this.launchBall(i);
      tl.call(()=>{this.reels.forEach(r=>{for(const child of r.holder.removeChildren()){gsap.killTweensOf(child);child.destroy({children:true})}r.symbols=[];for(let j=-2;j<=0;j++){const symbol=this.symbol(this.prizes[(j+this.prizes.length+r.index)%this.prizes.length]);symbol.y=j*132;r.holder.addChild(symbol);r.symbols.push(symbol)}r.spinning=true;r.index=0});this.status.text='REELS ACTIVATED';this.resultLabel.text='방송에 행운을 더하는 순간'},[],2.4);
      [4.7,5.8,7.2].forEach((at,i)=>tl.call(()=>{this.stopReel(i,prize);if(i===1)this.status.text='FINAL REEL'},[],at));
      tl.call(()=>{this.status.text=prize.jackpot?'JACKPOT / SPECIAL REWARD':'REWARD CONFIRMED';this.resultLabel.text=prize.label;this.amountLabel.text=prizeAmount(prize);const crown=this.ceremony(prize);crown.scale.set(.78);crown.alpha=0;gsap.to(crown.scale,{x:1,y:1,duration:.6,ease:'back.out(1.8)'});gsap.to(crown,{alpha:1,duration:.2});this.particles(384,730,prize.color,prize.jackpot?140:60);this.particles(170,400,0xffd57d,30);this.particles(598,400,0xffd57d,30);this.sound('win',.5)},[],7.25);
      tl.to(this.root,{x:5,y:-3,duration:.045,yoyo:true,repeat:3},7.25).to(this.root,{x:0,y:0,duration:.08},7.5);
      tl.to(this.gateGlow,{alpha:.95,duration:.18,yoyo:true,repeat:5},7.3);
      tl.to({}, {duration:.3},8.8);
    });
  }
  destroy(){
    if(this.dead)return;this.finishShow?.();this.dead=true;clearTimeout(this.watchdog);document.removeEventListener('visibilitychange',this.onVisibility);
    this.audio.forEach(a=>a.pause());this.audio.clear();this.timeline?.kill();this.reels.forEach(r=>r.symbols.forEach(s=>gsap.killTweensOf(s)));
    if(this.app?.renderer)this.app.destroy(true,{children:true});this.host.replaceChildren();
  }
}

let session=null,previewTransport=null;
const api=(path,body)=>previewTransport?previewTransport(path,body):window.apiRequest(`soopketland/${path}`,body?{method:'POST',body:JSON.stringify(body)}:{},{timeoutMs:20000,ttl:0});
async function copy(code,button){try{await navigator.clipboard.writeText(code);button.textContent='복사 완료';setTimeout(()=>{if(button.isConnected)button.textContent='코드 복사'},1500)}catch{const input=button.parentElement.querySelector('input');input?.select();button.textContent='코드를 선택해 복사하세요'}}
function ticketKey(){return `soopketland.pending.v2039:${window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||'preview'}`}
function readPending(){try{return localStorage.getItem(ticketKey())||''}catch{return ''}}
function savePending(value){if(value)localStorage.setItem(ticketKey(),value);else localStorage.removeItem(ticketKey())}
function ownerPending(){try{return JSON.parse(localStorage.getItem(`${ticketKey()}:owner`)||'null')}catch{return null}}
const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):''};

function view(){return `<section class="sl-land" data-soopketland><header class="sl-top"><div><span>행정부 / STREAMER EXCLUSIVE</span><h1>숲켓랜드<i>LIVE EVENT ARCADE</i></h1></div><button type="button" data-sl-refresh>새로고침 ↻</button></header><div class="sl-body" data-sl-body aria-live="polite"><div class="sl-empty">전용 이용권과 방송 이벤트 정보를 확인하고 있습니다.</div></div></section>`}
function prizeTile(p){return `<article class="sl-prize"><span class="sl-symbol" style="--prize-color:#${Number(p.color).toString(16).padStart(6,'0')}">${esc(p.symbol)}</span><div><strong>${esc(p.label)}</strong><p>${esc(p.range)}</p></div><small>${Number(p.percent||0).toFixed(2)}%</small></article>`}
function resultHtml(result,compact=false){
  const p=result.prize;
  return `<article class="sl-receipt ${p.jackpot?'is-jackpot':''} ${compact?'is-compact':''}"><div class="sl-receipt-heading"><span>${result.delivery==='VIEWER_COUPON'?'VIEWER GIFT / 공유용 쿠폰':'STREAMER GIFT / 지급 완료'}</span>${result.createdAt?`<time>${stamp(result.createdAt)}</time>`:''}</div><h3>${esc(p.label)} <b>${esc(prizeAmount(p))}</b></h3>${result.code?`<p>선착순 ${num(result.couponUses)}명 · 계정당 1회 · 시청자에게 코드를 공유하세요</p><div class="sl-code"><input readonly aria-label="시청자 공유용 쿠폰 코드" value="${esc(result.code)}"><button type="button" data-sl-copy="${esc(result.code)}">코드 복사</button></div>`:'<p>인벤토리 → 하이퍼버닝 발동권에서 사용하세요.<br>서버 전체 ×15 · 60분, 기존 버닝 종료 후 발동 가능합니다.</p>'}</article>`;
}
function ownerPanel(data){
  if(!data.owner)return '';
  const o=data.owner,targets=[...o.accounts.map(a=>({id:a.user_id,nickname:a.nickname,tickets:a.tickets})),{...o.self,tickets:data.tickets}];
  return `<details class="sl-owner"><summary><span>OWNER CONTROL</span><b>이용권 지급 · 확률 관리</b><em>＋</em></summary><div class="sl-owner-body">${o.missing.length?`<p class="sl-error">계정 확인 필요: ${o.missing.map(esc).join(', ')}. 중복·미등록 계정은 자동 연결하지 않습니다.</p>`:''}<form data-sl-grant><h3>방송 이벤트 이용권 지급</h3><div class="sl-fields"><label>대상 계정<select name="userId">${targets.map(a=>`<option value="${Number(a.id)}">${esc(a.nickname)} · 보유 ${num(a.tickets)}개</option>`).join('')}</select></label><label>이용권 수량<input name="quantity" type="number" min="1" max="1000" value="1" required></label><label>쿠폰당 사용 인원<input name="couponUses" type="number" min="1" max="1000" value="1" required></label></div><p>한 번 당첨된 수량을 각 시청자가 모두 받습니다. 하이퍼버닝 발동권은 스트리머에게 1개가 직접 지급됩니다.</p><button type="submit">지급 내용 확인</button></form><form data-sl-weights><h3>보상별 추첨 가중치</h3><div class="sl-weight-grid">${data.prizes.map(p=>`<label>${esc(p.label)}<input type="number" name="${p.key}" min="0" max="10000" value="${Number(o.weights[p.key])}" required></label>`).join('')}</div><p>기본은 이예준 카드 3%, 나머지 7종은 같은 확률입니다. 랜덤카드는 장마다 추첨하며 이예준 카드는 별도 보상으로만 나옵니다. 0은 제외, 수량 구간 안에서는 동일 확률로 결정됩니다. 저장 이후의 추첨부터 적용됩니다.</p><button type="submit">가중치 저장</button></form><section class="sl-issued"><h3>최근 발급 쿠폰</h3>${o.coupons.length?o.coupons.map(c=>{let p={};try{p=JSON.parse(c.reward_json)}catch{}return `<div><span><b>${esc(p.label)} ${num(p.amount)}</b><code>${esc(c.code)}</code></span><small>${num(c.used_count)} / ${num(c.max_uses)}명</small><button type="button" data-sl-disable="${esc(c.code)}" ${Number(c.is_active)?'':'disabled'}>${Number(c.is_active)?'사용 중지':'중지됨'}</button></div>`}).join(''):'<p>아직 발급된 쿠폰이 없습니다.</p>'}</section></div></details>`;
}
function render(data,s){
  if(session!==s||!s.host.isConnected)return;
  s.data=data;
  s.host.innerHTML=`<div class="sl-marquee"><div><small>ONLY ON SOOPKETMON</small><h2>오늘 방송의<br><em>특별한 한 방.</em></h2><p>구슬을 쏘고, 행운을 열고.<br>시청자와 함께 나누는 라이브 선물.</p></div><div class="sl-guest"><span>INVITATION ONLY</span><strong>${num(data.tickets)}<small>EVENT PASSES</small></strong><p>OWNER 지급 이용권만 사용<br>자동 충전 · 코인 구매 없음</p></div></div><div class="sl-layout"><section class="sl-machine-section" aria-label="빠찡코 이벤트"><div class="sl-machine" data-sl-canvas><img src="${ART}" alt="숲켓랜드 기계"><span>기계를 준비하는 중입니다</span></div><div class="sl-machine-controls"><button type="button" data-sl-sound aria-pressed="false">SOUND OFF</button><span>GPU PACHINKO / 3 REELS</span><button type="button" data-sl-skip disabled>연출 건너뛰기</button></div></section><aside class="sl-console"><div class="sl-control-head"><span>LET THE SHOW BEGIN</span><h2>라이브 이벤트</h2><p>1회당 이용권 1개 · 결과는 메시지함에도 보관</p></div><div class="sl-pass-stat"><span>사용 가능한 이용권</span><strong data-sl-balance>${num(data.tickets)}<small>개</small></strong></div><button type="button" class="sl-launch" data-sl-play ${!data.tickets&&!readPending()?'disabled':''}><span>${readPending()?'RESULT RECOVERY':'LAUNCH THE BALL'}</span><b>${readPending()?'이전 결과 다시 확인':data.tickets?'이용권 1개로 시작':'이용권 지급 대기'}</b><i>↗</i></button><p class="sl-use-note">${data.nextCouponUses?`다음 당첨 쿠폰: 선착순 ${num(data.nextCouponUses)}명 · 계정당 1회`:'OWNER가 이용권을 지급하면 시작할 수 있습니다.'}<br>하이퍼버닝 발동권은 스트리머 인벤토리 지급</p><p class="sl-feedback" data-sl-feedback role="status"></p><div data-sl-result></div><div class="sl-prize-head"><h3>오늘의 선물 라인업</h3><span>SERVER VERIFIED</span></div><div class="sl-prizes">${data.prizes.map(prizeTile).join('')}</div></aside></div><section class="sl-history"><header><div><span>YOUR BROADCAST GIFTS</span><h2>당첨 보관함</h2></div><small>최근 30회 · 전체 코드는 메시지함 확인</small></header><div data-sl-history>${data.history.length?data.history.map(r=>resultHtml(r,true)).join(''):'<div class="sl-empty">첫 번째 방송 선물을 기다리고 있습니다.</div>'}</div></section>${ownerPanel(data)}`;
  const pending=readPending(),recovered=data.history.find(r=>r.requestId===pending);
  if(recovered){savePending('');s.host.querySelector('[data-sl-result]').innerHTML=resultHtml(recovered);s.host.querySelector('[data-sl-play]').disabled=!data.tickets;s.host.querySelector('[data-sl-play] b').textContent=data.tickets?'이용권 1개로 시작':'이용권 지급 대기'}
  s.renderer=new PachinkoStage(s.host.querySelector('[data-sl-canvas]'),data.prizes);
  s.ready=s.renderer.init().catch(error=>{if(session!==s)return null;console.warn('[soopketland] renderer unavailable',error?.message);s.renderer.destroy();s.renderer=null;const host=s.host.querySelector('[data-sl-canvas]');if(host){host.innerHTML=`<img src="${ART}" alt="숲켓랜드 기계"><span>이 기기는 간편 결과 표시로 진행됩니다</span>`}return null});
  bindControls(s);
  const pendingOwner=ownerPending();if(data.owner&&pendingOwner){const panel=s.host.querySelector('.sl-owner-body'),note=document.createElement('p');note.className='sl-error';note.textContent='응답을 확인하지 못한 OWNER 요청이 남아 있습니다. 같은 요청으로 먼저 확인하세요. ';const b=document.createElement('button');b.type='button';b.textContent='이전 요청 결과 확인';b.onclick=()=>mutation(s,b,pendingOwner.path,pendingOwner.body);note.append(b);panel.prepend(note);panel.parentElement.open=true}
}
function bindCopies(host){host.querySelectorAll('[data-sl-copy]').forEach(b=>b.onclick=()=>copy(b.dataset.slCopy,b))}
function bindControls(s){
  const host=s.host;bindCopies(host);
  host.querySelector('[data-sl-sound]').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent=on?'SOUND ON · 10%':'SOUND OFF';if(s.renderer)s.renderer.soundOn=on};
  host.querySelector('[data-sl-skip]').onclick=()=>s.renderer?.finishShow?.();
  host.querySelector('[data-sl-play]').onclick=()=>play(s);
  host.querySelector('[data-sl-grant]')?.addEventListener('submit',async event=>{
    event.preventDefault();const f=new FormData(event.currentTarget),userId=Number(f.get('userId')),quantity=Number(f.get('quantity')),couponUses=Number(f.get('couponUses'));
    const label=event.currentTarget.querySelector('select').selectedOptions[0].textContent;
    if(!confirm(`${label}\n이용권 ${quantity}개 · 당첨 쿠폰당 ${couponUses}명\n코인 최고 당첨 기준 쿠폰당 ${num(couponUses*Number(s.data.prizes.find(p=>p.key==='COIN')?.max||20)*100000000)}코인이 지급될 수 있습니다.\n이대로 지급할까요?`))return;
    await mutation(s,event.submitter,'grant',{userId,quantity,couponUses});
  });
  host.querySelector('[data-sl-weights]')?.addEventListener('submit',async event=>{event.preventDefault();const weights=Object.fromEntries([...new FormData(event.currentTarget)].map(([k,v])=>[k,Number(v)]));await mutation(s,event.submitter,'settings',{weights})});
  host.querySelectorAll('[data-sl-disable]').forEach(b=>b.onclick=async()=>{if(confirm('이미 받은 보상은 유지하고, 이 쿠폰의 추가 사용만 중지할까요?'))await mutation(s,b,'coupon/disable',{code:b.dataset.slDisable})});
}
async function mutation(s,button,path,body){
  if(s.busy)return;s.busy=true;button.disabled=true;
  // Persist OWNER receipts across reloads too. An uncertain grant must be resolved
  // before another grant, never silently re-issued with a fresh identifier.
  const key=`${ticketKey()}:owner`;
  try{
    let pending=ownerPending();
    if(pending&&(pending.path!==path||JSON.stringify(pending.body)!==JSON.stringify(body)))throw new Error('이전 OWNER 요청을 먼저 ‘이전 요청 결과 확인’으로 확인하세요.');
    if(!pending){pending={path,body,requestId:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(pending))}
    const result=await api(path,{...body,requestId:pending.requestId});localStorage.removeItem(key);alert(result.message);await bind();
  }catch(error){if([400,401,403,409].includes(Number(error.status)))localStorage.removeItem(key);alert(error.message);button.disabled=false}finally{s.busy=false}
}
async function play(s){
  if(s.busy||session!==s)return;
  const host=s.host,button=host.querySelector('[data-sl-play]'),feedback=host.querySelector('[data-sl-feedback]'),skip=host.querySelector('[data-sl-skip]');
  s.busy=true;button.disabled=true;feedback.textContent='이용권과 서버 확정 결과를 확인하고 있습니다…';
  try{
    let requestId=readPending();if(!requestId){requestId=crypto.randomUUID();savePending(requestId)}
    const result=await api('spin',{requestId});
    if(session!==s)return;
    feedback.textContent=result.replayed?'저장된 당첨 결과를 복구했습니다.':'당첨 결과 저장 완료 · 연출이 종료되면 선물이 공개됩니다.';
    host.querySelector('[data-sl-canvas]').scrollIntoView({block:'center',behavior:s.renderer?.reduced?'instant':'smooth'});
    skip.disabled=false;
    // Resource loading must not deadlock a committed result, even without WebGL/rAF.
    let timeout;await Promise.race([s.ready,new Promise(resolve=>{timeout=setTimeout(resolve,2500)})]);clearTimeout(timeout);
    if(session!==s)return;
    if(s.renderer?.readyToPlay)await s.renderer.play(result);
    if(session!==s)return;
    host.querySelector('[data-sl-result]').innerHTML=resultHtml(result);bindCopies(host);savePending('');
    host.querySelector('[data-sl-result]').scrollIntoView({block:'center',behavior:s.renderer?.reduced?'instant':'smooth'});
    window.clearApiCache?.('inventory');window.clearApiCache?.('shell/summary');
    const updated=await api('state');if(session!==s)return;
    s.data=updated;host.querySelector('[data-sl-balance]').innerHTML=`${num(updated.tickets)}<small>개</small>`;
    host.querySelector('[data-sl-history]').innerHTML=updated.history.map(r=>resultHtml(r,true)).join('');bindCopies(host);
    feedback.textContent=result.code?'메시지함에도 보관했습니다. 코드를 복사해 시청자에게 공유하세요.':'발동권이 인벤토리에 지급되었습니다.';
  }catch(error){
    if(session!==s)return;
    if(error.status&&[400,403,409].includes(Number(error.status)))savePending('');
    feedback.textContent=`${error.message} ${readPending()?'같은 요청 번호로 결과를 다시 확인할 수 있습니다.':''}`;
  }finally{
    s.busy=false;if(session===s){skip.disabled=true;button.disabled=!s.data?.tickets&&!readPending();button.querySelector('b').textContent=readPending()?'이전 결과 다시 확인':s.data?.tickets?'이용권 1개로 시작':'이용권 지급 대기';button.querySelector('span').textContent=readPending()?'RESULT RECOVERY':'LAUNCH THE BALL'}
  }
}
async function bind(){
  const host=document.querySelector('[data-sl-body]');if(!host)return;stop();
  const s=session={host,busy:false,renderer:null};
  const refresh=document.querySelector('[data-sl-refresh]');if(refresh)refresh.onclick=()=>{if(!s.busy)bind()};
  try{const data=await api('state');if(session===s)render(data,s)}catch(error){if(session===s)host.innerHTML=`<div class="sl-empty"><b>${esc(error.message)}</b><p>등록된 스트리머 5개 계정과 OWNER만 이용할 수 있는 방송 이벤트 공간입니다.</p><button type="button" data-sl-retry>다시 확인</button></div>`;host.querySelector('[data-sl-retry]')?.addEventListener('click',bind)}
}
function stop(){if(session){session.renderer?.destroy();session=null}}
window.soopketLandView=view;window.bindSoopketLandView=bind;window.stopSoopketLandView=stop;
window.SoopketLand={PachinkoStage,view,bind,stop,preview:async(transport,root)=>{previewTransport=transport;root.innerHTML=view();await bind()},diagnostics:()=>({active:!!session,webgl:!!session?.renderer?.app?.renderer,balls:session?.renderer?.balls.length||0,particles:session?.renderer?.dust.length||0,busy:!!session?.busy})};
