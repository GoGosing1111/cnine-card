// Test player: reads only the same clues/options delivered to a browser.
const runes=['화','월','뇌','풍'];
export function visibleDecisionChoice(task){
  const {type}=task.decision,options=task.choices;
  if(type==='SEAL'){
    const [,anchor,direction,count]=task.clue.match(/([화월뇌풍])에서 (정방향|역방향) (\d)칸/);
    const rune=runes[(runes.indexOf(anchor)+(direction==='정방향'?1:-1)*Number(count)+8)%4];
    return options.find(o=>o.rune===rune).id;
  }
  if(type==='IDENTIFY')return options.find(o=>task.clue.includes(o.rune+' 문양 + '+o.shape+'.')).id;
  if(type==='PRIORITY'||type==='EXPOSURE')return options.filter(o=>!o.reflected).sort((a,b)=>a.impactAt-b.impactAt)[0].id;
  if(type==='HEAT')return options.filter(o=>!o.preserved&&!o.reflected).sort((a,b)=>b.heat-a.heat)[0].id;
  if(type==='TRIAGE')return options.filter(o=>!o.shielded).sort((a,b)=>a.impactAt-b.impactAt)[0].id;
  if(type==='INTERCEPT')return options[0].id;
  throw new Error('Unknown decision '+type);
}
export const decisionReady=(task,now)=>!task.done&&!task.blocked&&now>=task.decision.readyAt&&now>=task.decision.recoveryAt;
