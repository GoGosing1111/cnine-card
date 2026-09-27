export const STAGES=Object.freeze([
 {level:0,name:'기본',description:'얇고 차분한 본래의 프레임'},
 {level:5,name:'연마',description:'매끄럽게 연마한 표면'},
 {level:10,name:'면 가공',description:'입체 반사광과 가장자리를 감싸는 빛'},
 {level:15,name:'프레스티지',description:'보석 세공 프레임 · 반사광과 아우라'},
 {level:20,name:'천상의 성물',description:'최종 강화 전용 성물 프레임 · 찬란한 후광 · 빛의 파편'}
]);
export const MATERIALS=Object.freeze({
 gold:{name:'샴페인 골드',tag:'CHAMPAGNE GOLD',color:0xe4c28c,rgb:[228,194,140],base:[.91,.65,.31],gloss:42,description:'따뜻한 금속 광택과 넓은 면 반사'},
 crystal:{name:'크리스털',tag:'OPTICAL CRYSTAL',color:0xbcdbea,rgb:[188,219,234],base:[.46,.67,.88],gloss:72,description:'유리 단면의 깊이와 은은하게 갈라지는 굴절광'},
 chrome:{name:'블랙 크롬',tag:'BLACK CHROME',color:0xb7c6d6,rgb:[183,198,214],base:[.26,.32,.4],gloss:115,description:'검은 거울 위로 드러나는 선명한 반사광'}
});
export const BURST_DURATION=3.6;
export function perimeterPoint(distance,rect){
 const {x,y,w,h}=rect,r=Math.min(14,w/8,h/8),a=w-2*r,b=h-2*r,c=Math.PI*r/2,length=2*(a+b)+4*c;
 let d=((distance%length)+length)%length;
 const line=(sx,sy,dx,dy,nx,ny)=>({x:sx+dx*d,y:sy+dy*d,nx,ny});
 if(d<a)return line(x+r,y,1,0,0,-1);d-=a;
 const arc=(cx,cy,start)=>{const angle=start+d/r;return{x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r,nx:Math.cos(angle),ny:Math.sin(angle)}};
 if(d<c)return arc(x+w-r,y+r,-Math.PI/2);d-=c;
 if(d<b)return line(x+w,y+r,0,1,1,0);d-=b;
 if(d<c)return arc(x+w-r,y+h-r,0);d-=c;
 if(d<a)return line(x+w-r,y+h,-1,0,0,1);d-=a;
 if(d<c)return arc(x+r,y+h-r,Math.PI/2);d-=c;
 if(d<b)return line(x,y+h-r,0,-1,-1,0);d-=b;
 return arc(x+r,y+r,Math.PI);
}
export const perimeterLength=({w,h})=>2*(w+h)-8*Math.min(14,w/8,h/8)+Math.PI*2*Math.min(14,w/8,h/8);
export const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v)};
export const smooth=(a,b,t)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x)};
export const burstEnvelope=t=>({charge:Math.sin(Math.PI*smooth(0,.96,t))*(t<1.02?1:0),flash:(1-smooth(1.02,1.52,t))*smooth(.94,1.02,t),ring:smooth(1,2,t),release:smooth(.99,1.07,t)*(1-smooth(1.35,3.6,t))});
