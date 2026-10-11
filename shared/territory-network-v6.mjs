// The same graph drives server reachability and the tactical map.
export const TERRITORY_NETWORK_VERSION = 6;
export const isNetworkWar = round => Number(round?.warfare_version) === TERRITORY_NETWORK_VERSION;
export const hasTerritorySkills = round => [4, TERRITORY_NETWORK_VERSION].includes(Number(round?.warfare_version));
export const NETWORK_NODES = Object.freeze([
  {index:0,code:'A_BASE',name:'서부 본진',type:'HOME',x:8,y:50,owner:'A',lane:'본진'},
  {index:1,code:'NORTH_WEST',name:'북서 고지',type:'OUTPOST',x:28,y:20,owner:'A',lane:'북부'},
  {index:2,code:'NORTH_EAST',name:'북동 요새',type:'OUTPOST',x:72,y:20,owner:'B',lane:'북부'},
  {index:3,code:'WEST_GATE',name:'서부 관문',type:'GATE',x:28,y:50,owner:'A',lane:'중부'},
  {index:4,code:'CENTER',name:'중앙 교차지',type:'CENTER',x:50,y:50,owner:'',lane:'중부'},
  {index:5,code:'EAST_GATE',name:'동부 관문',type:'GATE',x:72,y:50,owner:'B',lane:'중부'},
  {index:6,code:'SOUTH_WEST',name:'남서 보급로',type:'MID',x:28,y:80,owner:'A',lane:'남부'},
  {index:7,code:'SOUTH_EAST',name:'남동 보급로',type:'MID',x:72,y:80,owner:'B',lane:'남부'},
  {index:8,code:'B_BASE',name:'동부 본진',type:'HOME',x:92,y:50,owner:'B',lane:'본진'}
].map(Object.freeze));
export const NETWORK_EDGES = Object.freeze([
  [0,1],[0,3],[0,6],[1,2],[1,3],[1,4],[2,4],[2,5],[2,8],
  [3,4],[3,6],[4,5],[4,6],[4,7],[5,7],[5,8],[6,7],[7,8]
].map(Object.freeze));
export const networkNeighbors = index => NETWORK_EDGES.flatMap(([a,b]) => a===index?[b]:b===index?[a]:[]);

export function networkControl(rows = NETWORK_NODES) {
  const owners=new Map(rows.map(row=>[Number(row.node_index??row.index),String(row.owner||'')]));
  const connected={A:new Set(),B:new Set()};
  for(const side of ['A','B']){
    const home=side==='A'?0:8,queue=owners.get(home)===side?[home]:[];
    while(queue.length){const index=queue.shift();if(connected[side].has(index))continue;connected[side].add(index);
      for(const neighbor of networkNeighbors(index))if(owners.get(neighbor)===side&&!connected[side].has(neighbor))queue.push(neighbor);
    }
  }
  const canInvade=(index,side)=>owners.get(index)!==side&&networkNeighbors(index).some(n=>connected[side].has(n));
  const nodes=NETWORK_NODES.map(node=>{
    const owner=owners.get(node.index)||'',aAttack=canInvade(node.index,'A'),bAttack=canInvade(node.index,'B');
    return {...node,owner,a_access:Number(aAttack||(owner==='A'&&bAttack)),b_access:Number(bAttack||(owner==='B'&&aAttack)),
      connected:owner?connected[owner].has(node.index):false,contested:aAttack||bAttack};
  });
  return {nodes,counts:{A:nodes.filter(n=>n.owner==='A').length,B:nodes.filter(n=>n.owner==='B').length,neutral:nodes.filter(n=>!n.owner).length}};
}
export function networkTimeWinner(nodes,round){
  const {counts}=networkControl(nodes);
  if(counts.A!==counts.B)return counts.A>counts.B?'A':'B';
  const a=Number(round?.a_total_damage||0),b=Number(round?.b_total_damage||0);
  return a===b?'DRAW':a>b?'A':'B';
}
