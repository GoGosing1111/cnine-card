export const BULLET=Object.freeze({flight:.055,maxTrail:180,trailFraction:.36,muzzleDuration:.075,impactDuration:.16});

// Both Uzi skills use the same straight flight and contact time on the GSAP clock.
export function bulletSegment(origin,hit,age){
 const dx=hit.x-origin.x,dy=hit.y-origin.y,distance=Math.hypot(dx,dy);
 if(distance<.001||age<0)return null;
 const tail=Math.min(BULLET.trailFraction,BULLET.maxTrail/distance);
 const travel=age/BULLET.flight;
 if(travel>=1+tail)return null;
 const point=q=>{const p=Math.max(0,Math.min(1,q));return {x:origin.x+dx*p,y:origin.y+dy*p};};
 return {start:point(travel-tail),end:point(travel),alpha:travel<=1?1:1-(travel-1)/tail};
}
