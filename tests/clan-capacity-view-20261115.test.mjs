import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationDashboardView} from '../js/organization-dashboard-v1.mjs';
import {organizationJoinView} from '../js/organization-join-v1.mjs';

const organizations=[8,10,15,25,25].map((limit,i)=>({id:i+1,memberCount:i?limit-1:limit,memberLimit:limit,hideout:{stage:i+1,name:'아지트 '+(i+1)}}));
test('clan directory shows the stored hideout capacity for each level',()=>{
 const html=organizationDashboardView({organizations,round:{id:'current'}});
 for(const o of organizations)assert(html.includes(`${o.memberCount} / ${o.memberLimit}명`));
 assert(!html.includes('클랜별 최대 25명'));
});
test('application screen disables a full level-one clan while leaving other levels selectable',()=>{
 const html=organizationJoinView({organizations,join:{canApply:true,canReview:false,applications:[]}});
 assert.match(html,/<option value="1" disabled>[^<]*8\/8명/);
 for(const o of organizations.slice(1))assert(html.includes(`<option value="${o.id}" >`)&&html.includes(`${o.memberCount}/${o.memberLimit}명`));
 const review=organizationJoinView({organizations,join:{canApply:false,canReview:true,applications:[]}});
 assert(review.includes('현재 아지트 레벨의 정원'));
});
