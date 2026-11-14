import {clanResumeFixture} from './clan-resume-fixture.mjs';
import {applyResume,inspectResume} from '../../scripts/ops/clan-resume-20261025.mjs';
import {reconcileOrganizationRecruitment} from '../../functions/_organization.js';
const day=86400000;
export async function calendarFixture(t){
 const f=await clanResumeFixture(t),review=await inspectResume(f.pg);
 await applyResume(f.pg,{now:f.clock(),expectedReviewHash:review.reviewHash,random:()=>0,dryRun:false});
 f.advance(Date.parse('2026-11-14T16:00:00+09:00')-f.clock());
 const q=async(s,p=[])=>(await f.pg.query(s,p)).rows;
 const previous=JSON.parse((await q("SELECT value FROM app_meta WHERE key='clan_resumption_v1'"))[0].value);
 await q("UPDATE clan_seasons SET phase='COMPLETE' WHERE id=$1",[previous.seasonId]);
 const now=f.clock(),c={version:1,seasonNo:5,sourceRoundId:f.roundId,previousSeasonId:previous.seasonId,windowId:'qa-review-calendar',openedAt:now-day,elderClosesAt:now+3600000,startsAt:now+day+3600000,endsAt:now+51*day+3600000};
 const windowKey='organization:elder-season:'+f.roundId;
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[windowKey,JSON.stringify({id:c.windowId,calendar:c,openedAt:c.openedAt,closesAt:c.elderClosesAt,revision:0,applications:{},selections:{}})]);
 const view=async(user=1)=>(await f.organizationCall(user===1?'admin/organization':'organization/overview',{user})).data;
 const send=(action,user,extra={})=>f.post('organization/elder/'+action,{roundId:f.roundId,windowId:c.windowId,...extra},{user});
 const reviewApplicants=async(decisions,extra={},user=1)=>f.post('admin/organization/elder/review',{roundId:f.roundId,windowId:c.windowId,revision:(await view()).elderSeason.revision,decisions,...extra},{user});
 const leave=async(user,extra={})=>{const s=await view(user);return f.post('organization/member/leave',{roundId:s.round.id,revision:s.round.revision,organizationId:s.elderSeason.memberClubId,joinedAt:s.elderSeason.memberJoinedAt,windowRevision:s.elderSeason.revision,confirmation:'LEAVE_CLAN',...extra},{user});};
 return {...f,q,c,windowKey,view,send,reviewApplicants,leave,tick:()=>reconcileOrganizationRecruitment(f.env,f.deps,{now:f.clock()})};
}

