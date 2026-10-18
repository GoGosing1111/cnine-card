import {cityShift,CITY_PLACES} from './jokgak-city-v1.mjs';

export const CITY_SUPPLY_DURATION_MS=10*60*1000;
export const CITY_SUPPLY_WEAPONS=Object.freeze([
  {code:'GROZA',name:'그로자',power:700000,enabled:true,tier:5,kind:'weapon',supplyOnly:true},
  {code:'GOLDEN_AKS',name:'황금 AKS',power:700000,enabled:true,tier:5,kind:'weapon',supplyOnly:true}
]);
export const CITY_SUPPLY_PLACES=Object.freeze(CITY_PLACES.filter(p=>!['HOSPITAL','MOTEL'].includes(p.id)).map(p=>p.id));
export const citySupplyWeapon=code=>CITY_SUPPLY_WEAPONS.find(w=>w.code===code);
export function createCitySupplyPlan(now,mode,random){
  const shift=cityShift(now),startsAt=Math.max(shift.startsAt,now),remaining=shift.endsAt-startsAt;
  // A newly enabled round must not invent drops in the past. If fewer than two
  // complete windows remain, start with the next round instead of a short contest.
  const desired=random()<.5?2:3,count=remaining<2400000?0:Math.min(desired,Math.floor(remaining/1200000)),slot=count?remaining/count:0;
  return {version:1,epoch:shift.id,mode,createdAt:now,drops:Array.from({length:count},(_,i)=>{
    // Independent windows leave a five-minute margin and never overlap contests.
    const from=startsAt+i*slot+300000,to=startsAt+(i+1)*slot-CITY_SUPPLY_DURATION_MS-300000;
    const dropsAt=Math.floor(from+random()*(to-from));
    return {id:`${shift.id}:${mode}:${i+1}`,epoch:shift.id,mode,number:i+1,dropsAt,endsAt:dropsAt+CITY_SUPPLY_DURATION_MS,
      location:CITY_SUPPLY_PLACES[Math.floor(random()*CITY_SUPPLY_PLACES.length)],weaponCode:CITY_SUPPLY_WEAPONS[random()<.5?0:1].code,
      status:'OPEN',holder:null,revision:0,claimedAt:0,settledAt:0,winner:null};
  })};
}
export function citySupplyEligible(player,drop,now){
  return !!player?.active&&player.location===drop.location&&player.health>0&&!(player.deadUntil>now)&&!(player.jailedUntil>now)&&!(player.restUntil>now)&&!player.hospitalRequired;
}
export function citySupplyPublic(records,mode,now){
  const epoch=cityShift(now).id;
  const drops=records.map(r=>r.drop).filter(d=>d.epoch===epoch&&d.mode===mode&&d.dropsAt<=now).map(d=>({
    id:d.id,epoch:d.epoch,mode:d.mode,number:d.number,location:d.location,dropsAt:d.dropsAt,endsAt:d.endsAt,status:d.status,
    holder:d.holder,revision:d.revision,claimedAt:d.claimedAt,settledAt:d.settledAt,winner:d.winner,
    ...(d.status==='AWARDED'?{weapon:citySupplyWeapon(d.weaponCode)}:{})
  }));
  const notices=drops.flatMap(d=>[
    {id:d.id+':drop',kind:'DROP',epoch,mode,location:d.location,createdAt:d.dropsAt,endsAt:d.endsAt},
    ...(d.settledAt?[{id:d.id+':end',kind:d.status,epoch,mode,location:d.location,createdAt:d.settledAt,winner:d.winner,weapon:d.weapon}]:[])
  ]).filter(n=>n.createdAt>=now-120000).sort((a,b)=>a.createdAt-b.createdAt);
  return {epoch,mode,durationMs:CITY_SUPPLY_DURATION_MS,minDrops:2,maxDrops:3,weapons:CITY_SUPPLY_WEAPONS.map(w=>({...w,chance:50})),drops,notices};
}
