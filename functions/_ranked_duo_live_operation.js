// One indexed public lookup; lobby polling must not build profiles or advance a season.
export async function rankedDuoLiveOperation(env,now=Date.now()){
 const row=await env.DB.prepare(`SELECT s.id,s.status,s.config_json,s.recruit_until
  FROM app_meta m JOIN ranked_duo_seasons_v1 s ON s.id=m.value
  WHERE m.key='ranked_duo_current_v1'`).first();
 if(!row||!['RECRUITING','ACTIVE'].includes(row.status))return null;
 const config=JSON.parse(row.config_json);if(config.visible!==true)return null;
 const recruiting=row.status==='RECRUITING',deadline=recruiting?row.recruit_until:config.endsAt;
 if(!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=now||!recruiting&&Date.parse(config.startsAt)>now)return null;
 return {kind:'RANKED_DUO',phase:row.status,entityId:String(row.id),title:String(config.name||'랭크 듀오'),
  detail:recruiting?'2인 1팀 · 시즌 참가 신청':'2인 1팀 · 비동기 랭크 대전',deadlineAt:deadline,sortOrder:0};
}
