import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:clan-reshuffle-bongsoon:20261025:v1';
export const FIXED_USER=5426,FIXED_CLAN=6,CLANS=[1,2,3,4,5,6,7,8];
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inactive=new Set([5947,5972,4084]);
export function historyVisits(history){
 const ids=new Set(history.members.map(m=>Number(m.user_id))),evidence=[];
 const add=(user,clan,source)=>{user=Number(user);clan=Number(clan);if(ids.has(user)&&CLANS.includes(clan))evidence.push({userId:user,clanId:clan,source});};
 for(const row of history.regularHistory)add(row.user_id,row.clan_id,'clan_members:season:'+row.season_id);
 for(const row of history.members)add(row.user_id,row.organization_id,'current_organization');
 for(const receipt of history.receipts){
  const value=JSON.parse(receipt.value);
  if(receipt.key==='ops:organization-eight-balanced:20261025:v1'){
   for(const m of value.before.members)add(m.user_id,m.organization_id,receipt.key+':before');
   for(const m of value.assignments)add(m.user_id,m.organization_id,receipt.key+':after');
  }else if(receipt.key==='ops:organization-six:20261019:v1'){
   // Only the six retained organization IDs continue into today's clan identities.
   for(const m of value.backup.members)if(Number(m.organization_id)<=6)add(m.user_id,m.organization_id,receipt.key+':before');
   for(const m of value.assignments)add(m.user_id,m.organization_id,receipt.key+':after');
  }else if(receipt.key.startsWith('ops:clan-')){
   // Saved memberships/reward recipients are evidence; hypothetical plans and
   // undrafted pool candidates are deliberately not treated as past membership.
   const visit=(node,where)=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node)visit(child,where);return;}
    const uid=node.user_id??node.userId,cid=node.clan_id??node.clanId;
    if(uid&&cid)add(uid,cid,receipt.key+':'+where);
    for(const [key,child] of Object.entries(node))if(['before','after','members','recipients','result','groups','data'].includes(key))visit(child,where+'.'+key);
   };
   visit(value,'receipt');
  }
 }
 const visited=Object.fromEntries([...ids].map(id=>[id,[...new Set(evidence.filter(e=>e.userId===id).map(e=>e.clanId))].sort((a,b)=>a-b)]));
 return {visited,evidence};
}
function rng(seed){let s=parseInt(hash(seed).slice(0,8),16);return ()=>{s+=0x6D2B79F5;let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
// Successive shortest augmenting paths with integral capacities. Historical
// repeat cost dominates every random tie-break, proving the minimum per tier.
function assignTier(players,capacity,random){
 const n=players.length,N=n+10,source=N-2,sink=N-1,g=Array.from({length:N},()=>[]),links=[];
 const edge=(a,b,cap,cost)=>{const e={to:b,cap,cost,rev:g[b].length};g[a].push(e);g[b].push({to:a,cap:0,cost:-cost,rev:g[a].length-1});return e;};
 for(let i=0;i<n;i++){
  edge(source,i,1,0);links[i]=[];
  for(const c of CLANS){if(players[i].userId===FIXED_USER?c!==FIXED_CLAN:c===players[i].currentClan)continue;
   links[i].push({clan:c,edge:edge(i,n+c-1,1,(players[i].visited.includes(c)?1000000:0)+Math.floor(random()*1000))});
  }
 }
 for(const c of CLANS)edge(n+c-1,sink,capacity,0);
 for(let f=0;f<n;f++){
  const distance=Array(N).fill(Infinity),previous=Array(N),queue=[source],queued=Array(N).fill(false);distance[source]=0;queued[source]=true;
  for(let head=0;head<queue.length;head++){const u=queue[head];queued[u]=false;for(let k=0;k<g[u].length;k++){const e=g[u][k];if(e.cap&&distance[e.to]>distance[u]+e.cost){distance[e.to]=distance[u]+e.cost;previous[e.to]=[u,k];if(!queued[e.to]){queued[e.to]=true;queue.push(e.to);}}}}
  assert(Number.isFinite(distance[sink]),'No assignment satisfies fixed member, departures and power-tier quotas');
  for(let v=sink;v!==source;){const [u,k]=previous[v],e=g[u][k];e.cap--;g[v][e.rev].cap++;v=u;}
 }
 return players.map((p,i)=>({...p,clanId:links[i].find(l=>l.edge.cap===0).clan}));
}
const totals=players=>CLANS.map(c=>players.filter(p=>p.clanId===c).reduce((n,p)=>n+p.power,0));
const objective=(sums,mean)=>sums.reduce((n,s)=>n+(s-mean)**2,0);
export function planReshuffle(history,ratingSnapshot,{attempts=64,seed=OP}={}){
 assert.equal(history.members.length,128);assert.equal(ratingSnapshot.ratings.length,128);
 const {visited,evidence}=historyVisits(history),members=new Map(history.members.map(m=>[Number(m.user_id),m]));
 assert.equal(Number(members.get(FIXED_USER).organization_id),FIXED_CLAN);
 const sorted=ratingSnapshot.ratings.map(r=>{const m=members.get(r.userId);assert(m&&Number.isSafeInteger(r.power)&&r.power>0);return {userId:r.userId,nickname:m.nickname,power:r.power,sourceVersion:r.sourceVersion,currentClan:Number(m.organization_id),previousPower:Number(m.seed_power),previousSlot:Number(m.slot),visited:visited[r.userId],inactive:inactive.has(r.userId),joinedAt:Number(m.joined_at)};}).sort((a,b)=>b.power-a.power||a.userId-b.userId);
 assert.equal(new Set(sorted.map(p=>p.userId)).size,128);assert(!members.has(73));
 const boundaries=[0,8,16,32,64,96,128],total=sorted.reduce((n,p)=>n+p.power,0),mean=total/8;
 sorted.forEach((p,i)=>{p.rank=i+1;p.tier=boundaries.findIndex((b,t)=>t<6&&i>=b&&i<boundaries[t+1]);});
 let best=null,bestRepeat=Infinity,bestValue=Infinity;
 for(let attempt=0;attempt<attempts;attempt++){
  const random=rng(seed+':'+attempt),players=boundaries.slice(0,-1).flatMap((start,t)=>assignTier(sorted.slice(start,boundaries[t+1]),(boundaries[t+1]-start)/8,random)),sums=totals(players);
  const repeat=players.filter(p=>p.userId!==FIXED_USER&&p.visited.includes(p.clanId)).length;
  const inactiveCounts=CLANS.map(c=>players.filter(p=>p.inactive&&p.clanId===c).length);
  const inactivePenalty=()=>inactiveCounts.reduce((n,c)=>n+Math.max(0,c-1),0);
  let current=objective(sums,mean)+inactivePenalty()*1e12;
  const movable=players.filter(p=>p.userId!==FIXED_USER);
  // Annealing swaps only inside the same power tier, so 1/2/4 top-player
  // quotas and all 16-member capacities remain hard constraints throughout.
  for(let step=0;step<40000;step++){
   const a=movable[Math.floor(random()*movable.length)],pool=movable.filter(p=>p.tier===a.tier),b=pool[Math.floor(random()*pool.length)];
   if(a.clanId===b.clanId||b.clanId===a.currentClan||a.clanId===b.currentClan)continue;
   const oldRepeat=Number(a.visited.includes(a.clanId))+Number(b.visited.includes(b.clanId)),newRepeat=Number(a.visited.includes(b.clanId))+Number(b.visited.includes(a.clanId));
   if(oldRepeat!==newRepeat)continue;
   const ai=a.clanId-1,bi=b.clanId-1,d=b.power-a.power,oldA=sums[ai],oldB=sums[bi];
   sums[ai]+=d;sums[bi]-=d;inactiveCounts[ai]+=Number(b.inactive)-Number(a.inactive);inactiveCounts[bi]+=Number(a.inactive)-Number(b.inactive);
   const next=objective(sums,mean)+inactivePenalty()*1e12,temperature=1e7*Math.pow(1-step/40000,4);
   if(next<current||random()<Math.exp((current-next)/Math.max(1,temperature))){[a.clanId,b.clanId]=[b.clanId,a.clanId];current=next;}
   else{sums[ai]=oldA;sums[bi]=oldB;inactiveCounts[ai]-=Number(b.inactive)-Number(a.inactive);inactiveCounts[bi]-=Number(a.inactive)-Number(b.inactive);}
  }
  if(repeat<bestRepeat||repeat===bestRepeat&&current<bestValue){best=structuredClone(players);bestRepeat=repeat;bestValue=current;}
 }
 const assignments=CLANS.flatMap(clanId=>best.filter(p=>p.clanId===clanId).sort((a,b)=>b.power-a.power||a.userId-b.userId).map((p,i)=>({...p,slot:i+1,unvisited:!p.visited.includes(clanId),fixed:p.userId===FIXED_USER}))).sort((a,b)=>a.userId-b.userId);
 const summarize=useCurrent=>CLANS.map(id=>{const m=assignments.filter(p=>(useCurrent?p.currentClan:p.clanId)===id);return {id,count:m.length,power:m.reduce((n,p)=>n+p.power,0),top8:m.filter(p=>p.rank<=8).length,top16:m.filter(p=>p.rank<=16).length,top32:m.filter(p=>p.rank<=32).length,inactive3Days:m.filter(p=>p.inactive).length};});
 const before=summarize(true),after=summarize(false),range=groups=>(Math.max(...groups.map(g=>g.power))-Math.min(...groups.map(g=>g.power)))/mean*100;
 assert.equal(new Set(ratingSnapshot.ratings.map(r=>r.policyRevision)).size,1);
 const plan={operationKey:OP,seed,historyHash:hash(history),ratingsHash:hash(ratingSnapshot),evaluatedAt:ratingSnapshot.evaluatedAt,policyRevision:ratingSnapshot.ratings[0].policyRevision,advancedForgeRevision:ratingSnapshot.ratings[0].advancedForgeRevision,basis:ratingSnapshot.basis,memberCount:128,fixed:{userId:FIXED_USER,clanId:FIXED_CLAN},assignments,evidence,stats:{moved:assignments.filter(p=>p.currentClan!==p.clanId).length,unvisitedMoves:assignments.filter(p=>!p.fixed&&p.unvisited).length,repeatedMoves:bestRepeat,totalPower:total,meanPower:mean,beforeRangePercent:range(before),afterRangePercent:range(after),before,after}};
 assert.equal(plan.stats.moved,127);assert(after.every(g=>g.count===16&&g.top8===1&&g.top16===2&&g.top32===4));assert(after.every(g=>g.inactive3Days<=1));
 return {...plan,planHash:hash(plan)};
}
