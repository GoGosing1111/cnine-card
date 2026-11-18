import {calendarFixture} from './clan-review-fixture.mjs';

export async function seasonAdmissionFixture(t){
 const f=await calendarFixture(t);
 f.advance(f.c.elderClosesAt-f.clock());await f.tick();
 const [row]=await f.q('SELECT value FROM app_meta WHERE key=$1',[f.windowKey]),window=JSON.parse(row.value);
 window.selections={1:[{id:4,power:1000}],7:[{id:2,power:1000},{id:3,power:1000}]};
 window.members=Object.fromEntries(Array.from({length:6},(_,i)=>[i+5,{organizationId:7,power:1000,joinedAt:f.clock()+i}]));
 await f.q('UPDATE app_meta SET value=$2 WHERE key=$1',[f.windowKey,JSON.stringify(window)]);
 f.advance(f.c.startsAt-f.clock());const season=await f.tick();
 await f.q('UPDATE organization_progress_v1 SET stage=2 WHERE round_id=$1 AND organization_id=7',[season.roundId]);
 const apply=(user,extra={})=>f.post('organization/join/apply',{roundId:season.roundId,revision:0,organizationId:7,message:'함께하겠습니다.',...extra},{user});
 const review=(user,target,extra={})=>f.post('organization/join/review',{roundId:season.roundId,userId:target,revision:1,decision:'APPROVED',...extra},{user});
 return {...f,season,apply,review};
}
