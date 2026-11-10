import {ORGANIZATION_HUNTS} from '../shared/organization-hunts-v1.mjs?v=20261025-clan-eight';
export function organizationHuntView(stage,{kind='boss',ownedStage=0}={}){
 const zone=ORGANIZATION_HUNTS.find(z=>z.stage===stage);
 if(!zone)return '<section class="org-hunt-intro"><span class="org-kicker">UPPER HEADQUARTERS</span><h3>더 높은 아지트, 새로운 사냥터</h3><p>3·4·5단계 아지트에서 사냥터와 일반 몬스터·전용 보스를 미리 확인할 수 있습니다.</p><button type="button" data-stage="2">상위 사냥터 살펴보기</button></section>';
 const area=stage===3?'clan-dockyard':stage===4?'clan-garden':null;
 const available=area&&ownedStage>=stage,label=stage===4?'격전지(협동)':'군단토벌 파티';
 const entry=area?'<p class="org-small">시즌 5부터 '+label+'의 클랜 전용 메뉴에서 입장합니다.</p>':'';
 const unit=kind==='monster'?zone.monster:zone.boss;
 return '<section class="org-hunt" aria-labelledby="org-hunt-title"><header><div><span class="org-kicker">HUNTING GROUND / STAGE 0'+stage+'</span><h3 id="org-hunt-title">'+zone.name+'</h3><p>'+zone.description+'</p></div><span class="org-hunt-status">'+(available?'아지트 조건 달성':area?'아지트 '+stage+'단계':'개방 준비 중')+'</span></header><div class="org-hunt-layout"><div class="org-hunt-scene"><img class="org-hunt-background" src="'+zone.scene+'" alt="'+zone.name+' 사냥터 전경" width="1536" height="864"><img class="org-hunt-unit" src="'+unit.image+'" alt="'+unit.name+' 전신 원화"></div><div class="org-hunt-info"><nav aria-label="사냥터 몬스터"><button type="button" data-hunt-kind="monster" aria-pressed="'+(kind==='monster')+'">일반 몬스터</button><button type="button" data-hunt-kind="boss" aria-pressed="'+(kind==='boss')+'">전용 보스</button></nav><span class="org-kicker">'+(kind==='monster'?'FIELD MONSTER':'HIDEOUT BOSS')+'</span><h4>'+unit.name+'</h4><p>'+unit.description+'</p><dl><div><dt>연결 아지트</dt><dd>'+stage+'단계</dd></div><div><dt>전장 규칙</dt><dd>'+(stage===3?'아이템 드랍 확률 150%':stage===4?'2~3인 협동 · 격전 난이도':'준비 중')+'</dd></div><div><dt>입장 조건</dt><dd>'+(area?'소속 클랜 아지트 '+stage+'단계':'준비 중')+'</dd></div></dl>'+entry+'</div></div></section>';
}
