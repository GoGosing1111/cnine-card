// Full-song charts keep measured onset anchors. Additional two-key accents
// increase density without overlapping the +/-160ms same-lane judgment windows.
export function buildNoxChart(energies,{rate,hop,durationMs}){
  const start=5000,end=durationMs-200,flux=energies.map((x,i)=>Math.max(0,x-(energies[i-1]||0))),candidates=[];
  for(let i=8;i<flux.length-1;i++){
    const at=Math.round(i*hop/rate*1000);
    if(at>=start&&at<=end&&flux[i]>0&&flux[i]===Math.max(...flux.slice(Math.max(0,i-8),i+9)))candidates.push({at,strength:flux[i]});
  }
  const strengths=candidates.map(p=>p.strength).sort((a,b)=>a-b),threshold=Math.max(.004,Math.min(.016,strengths[Math.floor(strengths.length*.3)]||.016));
  const peaks=[];
  for(const p of candidates.filter(p=>p.strength>threshold)){
    if(!peaks.length||p.at-peaks.at(-1).at>=150)peaks.push(p);
    else if(p.strength>peaks.at(-1).strength)peaks[peaks.length-1]=p;
  }
  if(peaks.length<48)return null;
  // Carry the measured local pulse through rests and fades instead of leaving
  // an empty ending. Subdivisions follow neighbouring onset anchors, never a
  // second free-running clock. The last note retains the complete late window.
  const gaps=peaks.slice(1).map((p,i)=>p.at-peaks[i].at).filter(d=>d>=180&&d<=500).sort((a,b)=>a-b);
  const pulse=gaps[Math.floor(gaps.length/2)]||250,anchors=[];
  for(const p of peaks){
    if(anchors.length&&p.at-anchors.at(-1).at>700){const from=anchors.at(-1).at,steps=Math.round((p.at-from)/pulse);for(let i=1;i<steps;i++)anchors.push({at:Math.round(from+(p.at-from)*i/steps),strength:0});}
    anchors.push(p);
  }
  while(end-anchors.at(-1).at>pulse+100)anchors.push({at:anchors.at(-1).at+pulse,strength:0});
  if(end-anchors.at(-1).at>300)anchors.push({at:end,strength:0});
  const lanes=[0,2,1,3,2,0,3,1],notes=anchors.map((p,i)=>({lane:lanes[i%8],at:p.at}));
  const accents=new Set(),wanted=Math.round(anchors.length*.27);
  const add=i=>{
    if(accents.has(i)||accents.has(i-1)||accents.has(i+1))return;
    const at=anchors[i].at,base=lanes[i%8];
    const lane=[(base+2)%4,(base+3)%4,(base+1)%4].find(l=>!notes.some(n=>n.lane===l&&Math.abs(n.at-at)<330));
    if(lane===undefined)return;notes.push({lane,at});accents.add(i);
  };
  for(let i=0;i<wanted;i++)add(Math.min(anchors.length-1,Math.round((i+.5)*anchors.length/wanted)));
  for(let i=0;i<anchors.length&&accents.size<wanted;i++)add(i);
  notes.sort((a,b)=>a.at-b.at||a.lane-b.lane);notes.forEach((n,i)=>n.id=i);
  return {notes:notes.map(({id,lane,at})=>({id,lane,at})),onsets:peaks.length,restBeats:anchors.length-peaks.length,accents:accents.size,pulseMs:pulse};
}
