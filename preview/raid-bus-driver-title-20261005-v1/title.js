const TITLE='버스기사',SUBTITLE='행정부 정직원';
const fontURL='/assets/fonts/clan-camp/BlackHanSans-Regular.ttf';
const $=id=>document.getElementById(id);
function centeredBaseline(ctx,text,y){const m=ctx.measureText(text);return y+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;}
async function render(){
 const font=new FontFace('RaidDriverTitle',`url('${fontURL}')`);document.fonts.add(await font.load());await document.fonts.load('200px RaidDriverTitle',TITLE+SUBTITLE);
 const ornament=new Image();ornament.src='assets/bus-driver-ornament-v1.png';await ornament.decode();
 const padding=40,w=ornament.naturalWidth,h=ornament.naturalHeight,canvas=$('titleCanvas');canvas.width=w+padding*2;canvas.height=h+padding*2;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(ornament,padding,padding);ctx.translate(padding,padding);ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
 // Original ornament remains unchanged; all Korean letters are a separate deterministic text layer.
 ctx.font=`${h*.0505}px RaidDriverTitle`;ctx.letterSpacing=`${w*.0013}px`;let baseline=centeredBaseline(ctx,SUBTITLE,h*.512);ctx.strokeStyle='#123f31';ctx.lineWidth=5;ctx.strokeText(SUBTITLE,w*.5,baseline);ctx.fillStyle='#fff2c6';ctx.fillText(SUBTITLE,w*.5,baseline);
 ctx.font=`${h*.295}px RaidDriverTitle`;ctx.letterSpacing=`${w*.004}px`;baseline=centeredBaseline(ctx,TITLE,h*.716);
 ctx.fillStyle='#604017';ctx.strokeStyle='#05241e';ctx.lineWidth=h*.025;ctx.strokeText(TITLE,w*.5,baseline+h*.01);ctx.fillText(TITLE,w*.5,baseline+h*.01);
 ctx.lineWidth=h*.009;ctx.strokeStyle='#d5b66d';ctx.strokeText(TITLE,w*.5,baseline);
 const gold=ctx.createLinearGradient(0,h*.59,0,h*.84);gold.addColorStop(0,'#fffced');gold.addColorStop(.36,'#ffe6a2');gold.addColorStop(.53,'#f0c86a');gold.addColorStop(.56,'#fff0b5');gold.addColorStop(1,'#c78c3e');ctx.fillStyle=gold;ctx.fillText(TITLE,w*.5,baseline);
 const png=canvas.toDataURL('image/png');$('normalSize').src=$('smallSize').src=png;$('download').href=png;$('download').removeAttribute('aria-disabled');$('status').textContent='투명 PNG · 한글 별도 조판 · 칭호 시안';
 canvas.dataset.ready='true';canvas.dataset.title=TITLE;canvas.dataset.subtitle=SUBTITLE;canvas.dataset.font='Black Han Sans / OFL';
}
for(const button of document.querySelectorAll('[data-background]'))button.addEventListener('click',()=>{const value=button.dataset.background;$('showcase').dataset.background=value;for(const other of document.querySelectorAll('[data-background]'))other.setAttribute('aria-pressed',String(other===button));});
render().catch(error=>{$('status').textContent='칭호 준비에 실패했습니다. 새로고침해 주세요.';console.error(error);});
