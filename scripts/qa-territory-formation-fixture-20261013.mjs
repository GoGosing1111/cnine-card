// Local QA only. Never loaded by Pages Functions or game runtime.
const scenarios=new Set(['RECRUITING','REGISTERED','PREPARING','INCOMPLETE','SPECTATOR','TRUCE','OFF','OFF_REWARD','LONG_NAME']);
export function formationFixture(){
 const entries=new Map(),refreshed=new Set(),claimed=new Set(),truceEnds=new Map();
 return function apply(request,base){
  const ref=new URL(request.headers.referer||'http://127.0.0.1'),scenario=ref.searchParams.get('qaFormation');if(!scenarios.has(scenario))return null;
  const run=ref.searchParams.get('qaRun')||'preview',key=run+':'+scenario;
  const state=structuredClone(base),side=ref.searchParams.get('side')==='B'?'B':'A',status=scenario==='OFF'||scenario==='OFF_REWARD'?'DISABLED':['RECRUITING','REGISTERED'].includes(scenario)?'RECRUITING':scenario==='TRUCE'?'ACTIVE':'PREPARING';
  const operation=new URL(request.url,'http://127.0.0.1').pathname.split('/').at(-1);
  if(request.method==='POST'){
   if(operation==='register')entries.set(run,true);
   if(operation==='unregister')entries.set(run,false);
   if(operation==='refresh-loadout')refreshed.add(key);
   if(operation==='claim')claimed.add(key);
  }
  state.mode=status==='DISABLED'?'OFF':'ON';state.round={...state.round,status,recruitment_ends_at:new Date(Date.now()+7200000).toISOString(),starts_at:new Date(Date.now()+900000).toISOString()};
  state.mine=scenario==='SPECTATOR'||scenario==='RECRUITING'&&!entries.get(run)?null:{...state.mine,side:status==='RECRUITING'?null:side,status:status==='RECRUITING'?'WAITING':'ACTIVE',deck_power:refreshed.has(key)?1234567:987650,deck_snapshot:JSON.stringify([1,2,3,4,5]),formation_breakdown_json:JSON.stringify({deckComplete:true})};
  if(state.mine&&scenario==='INCOMPLETE'&&!refreshed.has(key)){state.mine.deck_snapshot='[1,2,3]';state.mine.formation_breakdown_json='{"deckComplete":false}';}
  state.registration={canRegister:scenario==='RECRUITING'&&!entries.get(run),canCancel:status==='RECRUITING'&&Boolean(state.mine)};
  if(scenario==='TRUCE'){if(!truceEnds.has(run))truceEnds.set(run,new Date(Date.now()+900000).toISOString());state.truce={active:true,endsAt:truceEnds.get(run)};}
  if(scenario==='LONG_NAME')state.settings.teamAName='은빛 서리바람을 지키는 수호의 기사단';
  if(scenario==='OFF_REWARD'&&!claimed.has(key))state.reward={round_id:69,result:'WIN',coin:1000,shards:10};
  return request.method==='POST'?{ok:true,state,deckPower:state.mine?.deck_power,coin:1000,shards:10}:state;
 };
}
