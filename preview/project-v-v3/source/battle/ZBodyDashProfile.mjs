export const DASH_V2_SEQUENCE = {
  durationMs:640, contactAtMs:245, contactStep:8,
  movement:{startMs:55,arriveMs:190,returnMs:390,homeMs:540},
  steps:[
    ['01',0,10,'ready'],['D1',10,45,'prep'],['D2',55,25,'launch'],
    ['D3',80,90,'approach'],['D4',170,20,'decelerate'],['04',190,20,'windup'],
    ['05',210,18,'slash'],['06',228,17,'slash'],['07',245,50,'contact'],
    ['08',295,35,'finish'],['09',330,30,'finish'],['10',360,30,'recover'],
    ['D4',390,25,'returnprep'],['D1',415,60,'retreat'],['02',475,65,'return'],
    ['01',540,100,'ready']
  ].map(([frame,atMs,durationMs,phase])=>({frame,atMs,durationMs,phase}))
};
export const DASH_V2_FX = {
  wake:{startMs:45,durations:[16,16,18,20,22,25,25,24,24,24,26,40]},
  cut:{startMs:191,durations:[18,18,18,48,32,32,34,42]}
};
export function effectSample(durations,age){
  if(age<0)return null;
  let start=0;
  for(let i=0;i<durations.length;i++){
    if(age<start+durations[i]){
      const progress=(age-start)/durations[i];
      return{index:i,next:Math.min(i+1,durations.length-1),blend:Math.max(0,(progress-.55)/.45),
        alpha:i===durations.length-1?1-progress:1};
    }
    start+=durations[i];
  }
  return null;
}
// Re-time the supplied receipts only. Never manufacture another hit or target.
export function fastDashBatch(batch,sequence=DASH_V2_SEQUENCE){
  return batch.mode==='dash'?{...batch,impacts:batch.impacts.map(hit=>({...hit,atMs:sequence.contactAtMs}))}:batch;
}
