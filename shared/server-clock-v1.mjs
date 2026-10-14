// Monotonic display time; gameplay and settlement remain server-authoritative.
export function createServerClock({now=()=>performance.now(),wallNow=()=>Date.now()}={}){
 let base=wallNow()-now(),target=base,last=0,lastMono=now(),bestRtt=Infinity,samples=0;
 function read(){const mono=now(),dt=Math.max(0,mono-lastMono);lastMono=mono;
  base+=Math.max(-dt*.08,Math.min(dt*.08,target-base));
  last=Math.max(last,mono+base);return last;
 }
 function sample(serverNow,{sentAt,receivedAt=now(),reset=false}={}){
  if(!Number.isFinite(serverNow)||serverNow<=0)return false;
  if(reset){samples=0;bestRtt=Infinity;}
  const rtt=Number.isFinite(sentAt)?receivedAt-sentAt:null;
  if(rtt!==null&&(rtt<0||rtt>10000))return false;
  if(rtt!==null){bestRtt=Math.min(bestRtt,rtt);if(rtt>bestRtt+250&&samples>2)return false;}
  const candidate=serverNow+(rtt===null?0:rtt/2)-receivedAt;
  if(!samples||reset){base=target=candidate;last=0;lastMono=receivedAt;}
  else if(rtt!==null||!Number.isFinite(bestRtt))target=candidate;
  samples++;return true;
 }
 return {now:read,sample,diagnostics:()=>({samples,bestRtt:Number.isFinite(bestRtt)?bestRtt:null,correctionMs:target-base})};
}
