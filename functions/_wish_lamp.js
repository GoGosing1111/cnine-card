// Retired on 2026-09-18. Tombstone for cached clients; no DB writes or item recreation.
export async function handleWishLamp({path,deps}){
 if(!path.startsWith('events/wish-lamp/')&&path!=='admin/wish-lamp')return null;
 if(path==='events/wish-lamp/feature')return deps.json({visible:false,phase:'RETIRED',name:'종료된 이벤트'});
 return deps.json({error:'소원램프 이벤트가 종료되었습니다. 금도끼 은도끼 이벤트를 이용해주세요.',code:'WISH_LAMP_RETIRED'},410);
}
