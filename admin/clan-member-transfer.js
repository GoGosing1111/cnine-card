const ENDPOINT='admin/clan-war/member-assignment';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const positive=value=>Number.isSafeInteger(value)&&value>0;
const identityKeys=['userId','nickname','clanId','clanName','seasonId','fromClanId','fromClanName'];
const confirmation=target=>target.fromClanId?'TRANSFER_EXPLICIT_CLAN_MEMBER':'REPLACE_EXPLICIT_CLAN_MEMBERS';

export function resolveReplacement(incoming,outgoing,state,nickname,removeNickname,clanId){
  const a=incoming?.player,b=outgoing?.player,season=state?.season;
  const clan=state?.clans?.find(c=>c.id===clanId&&c.active);
  check(season?.phase==='ACTIVE'&&positive(season.id)&&clan,'진행 중인 시즌과 대상 클랜을 확인하세요.');
  check(a?.nickname===nickname&&b?.nickname===removeNickname&&positive(a.id)&&positive(b.id)&&a.id!==b.id,'정확히 다른 두 계정을 지정하세요.');
  check(b.clan?.id===clan.id&&b.clan.name===clan.name&&b.clan.season===season.seasonNo&&b.clan.role==='클랜원','추방 대상이 해당 시즌·클랜의 일반 멤버가 아닙니다.');
  const target={userId:a.id,nickname:a.nickname,clanId:clan.id,clanName:clan.name,seasonId:season.id,removeMembers:[{userId:b.id,nickname:b.nickname}]};
  if(a.clan){
    check(a.clan.id!==clan.id&&a.clan.season===season.seasonNo&&a.clan.role==='클랜원','이적 대상의 현재 시즌·소속을 확인하세요. 이미 같은 클랜이거나 클랜장입니다.');
    check(state.clans.some(c=>c.active&&c.id===a.clan.id&&c.name===a.clan.name),'출발 클랜이 일치하지 않습니다.');
    target.fromClanId=a.clan.id;target.fromClanName=a.clan.name;
  }
  return target;
}

const exactRemoval=(rows,target)=>Array.isArray(rows)&&rows.length===1
  &&rows[0].userId===target.removeMembers[0].userId&&rows[0].nickname===target.removeMembers[0].nickname
  &&rows[0].clanId===target.clanId&&rows[0].memberRole==='MEMBER';

export function validateReplacementPreview(preview,target){
  check(preview?.ok&&identityKeys.every(k=>preview[k]===target[k]),'서버 확인 대상이 일치하지 않습니다.');
  check(typeof preview.previewId==='string'&&/^[0-9a-f-]{36}$/.test(preview.previewId)
    &&preview.confirmation===confirmation(target),'교체·이적 확인 번호가 올바르지 않습니다.');
  check(Array.isArray(target.removeMembers)&&target.removeMembers.length===1&&exactRemoval(preview.removals,target)
    &&preview.verified===true&&preview.rankedDeckReady===true&&!preview.gift&&!preview.clanGift,'정확한 1명 교체·인증·덱 검증을 확인하세요. 보상은 지급하지 않습니다.');
  check(target.fromClanId?preview.currentMembership?.clanId===target.fromClanId&&preview.currentMembership.clanName===target.fromClanName&&preview.currentMembership.memberRole==='MEMBER':!preview.currentMembership,'출발 클랜이 일치하지 않습니다.');
  check(Number.isInteger(preview.memberCount)&&preview.memberCount>=1&&preview.afterCount===preview.memberCount
    &&Number.isInteger(preview.maxMembers)&&preview.afterCount<=preview.maxMembers&&preview.maxMembers<=22,'정원은 늘릴 수 없습니다.');
  return preview;
}

export class ReplacementSession{
  constructor(request,save,receipt=null){this.request=request;this.save=save;this.receipt=receipt;this.busy=false;if(receipt)validateReplacementPreview(receipt.preview,receipt.target);}
  async preview(target){
    check(!this.busy&&!this.receipt?.started,'미확인 교체 요청을 먼저 확인하세요.');
    this.busy=true;this.receipt=null;
    try{this.save(null);const preview=validateReplacementPreview(await this.request(ENDPOINT,{action:'preview',...target}),target);
      const receipt={target,preview,started:false};this.save(receipt);this.receipt=receipt;return preview;
    }finally{this.busy=false;}
  }
  async apply(){
    check(!this.busy&&this.receipt,'교체 대상을 먼저 확인하세요.');
    if(this.receipt.result)return this.receipt.result;
    this.busy=true;
    try{
      const receipt={...this.receipt,started:true};this.save(receipt);this.receipt=receipt;
      const {preview,target}=receipt,result=await this.request(ENDPOINT,{action:'apply',previewId:preview.previewId,confirmation:confirmation(target)});
      check(result?.ok&&result.previewId===preview.previewId&&identityKeys.every(k=>result[k]===target[k])
        &&result.memberRole==='MEMBER'&&result.removedCount===1&&exactRemoval(result.removed,target)&&!result.gift&&!result.clanGift
        &&result.completedAt&&Number.isInteger(result.beforeCount)&&result.beforeCount>=1&&result.memberCount===result.beforeCount
        &&result.memberCount<=result.maxMembers&&result.maxMembers<=22,'완료 응답이 일치하지 않습니다. 같은 요청 번호로 다시 확인하세요.');
      this.receipt={...receipt,result};this.save(this.receipt);return result;
    }finally{this.busy=false;}
  }
}

async function boot(){
  const byId=id=>document.getElementById(id),status=(text,error=false)=>{byId('status').textContent=text;byId('status').dataset.error=String(error);};
  try{
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token');
    check(token,'CMS에서 OWNER로 로그인하세요.');
    const request=async(path,body)=>{
      const response=await fetch('/api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+token},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'서버 요청 실패');return data;
    };
    const owner=await request('admin/dashboard');check(owner.role==='OWNER'&&positive(Number(owner.admin?.id)),'OWNER만 사용할 수 있습니다.');
    byId('owner').textContent=`인증: ${owner.admin.nickname} · OWNER`;
    const state=await request('admin/clan-war/settings');check(state.season?.phase==='ACTIVE','진행 중인 시즌이 아닙니다.');
    for(const clan of state.clans.filter(c=>c.active)){const o=document.createElement('option');o.value=String(clan.id);o.textContent=`${clan.name} · ${clan.memberCount}/${state.season.maxMembers}명`;byId('clan').append(o);}
    const key='cnine_owner_clan_replacement:'+owner.admin.id,stored=JSON.parse(localStorage.getItem(key)||'null');
    const session=new ReplacementSession(request,receipt=>{if(receipt)localStorage.setItem(key,JSON.stringify(receipt));else localStorage.removeItem(key);},stored?.started?stored:null);
    const render=()=>{
      const r=session.receipt,p=r?.preview,t=r?.target,result=r?.result;
      byId('fields').disabled=session.busy||Boolean(r?.started);
      byId('approval').hidden=!p||Boolean(result);byId('confirm').disabled=session.busy;
      byId('apply').hidden=!p||Boolean(result);byId('apply').disabled=session.busy||!p||!byId('confirm').checked;
      byId('apply').textContent=r?.started?'같은 요청 번호로 결과 재확인':'확인한 1명 추방·이적 적용';
      byId('verify').hidden=!result;byId('verify').disabled=session.busy;
      byId('details').hidden=!p;
      if(p)byId('details').textContent=`${result?'처리 완료':'서버 검증 완료'}\n이적: ${t.nickname} (ID ${t.userId}) · ${t.fromClanName||'무소속'} → ${t.clanName}\n추방: ${t.removeMembers[0].nickname} (ID ${t.removeMembers[0].userId}) · ${t.clanName}\n시즌: ${p.seasonNo} (ID ${t.seasonId})\n대상 클랜 정원: ${result?result.memberCount:p.afterCount}/${p.maxMembers}명 · 정원 증설 없음\n보상 지급: 없음 · 계정 삭제/정지: 없음\n요청 번호: ${p.previewId}${result?'\n완료: '+result.completedAt:''}`;
    };
    byId('confirm').addEventListener('change',render);
    byId('form').addEventListener('submit',async event=>{
      event.preventDefault();if(session.busy||session.receipt?.started)return;
      byId('fields').disabled=true;byId('confirm').checked=false;status('두 계정의 정확한 소속과 서버 교체 조건을 확인하고 있습니다.');
      try{
        const a=byId('incoming').value.trim(),b=byId('outgoing').value.trim(),clanId=Number(byId('clan').value);
        const [incoming,outgoing,fresh]=await Promise.all([request('player-card?nickname='+encodeURIComponent(a)),request('player-card?nickname='+encodeURIComponent(b)),request('admin/clan-war/settings')]);
        await session.preview(resolveReplacement(incoming,outgoing,fresh,a,b,clanId));status('확인된 두 계정만 처리합니다. 대상을 확인하고 적용하세요.');
      }catch(error){session.receipt=null;status(error.message,true);}finally{render();}
    });
    byId('apply').addEventListener('click',async()=>{
      if(session.busy||!byId('confirm').checked||!session.receipt)return;
      const pending=session.apply();render();status('정원·소속 재검증 후 추방과 이적을 함께 적용하고 있습니다.');
      try{await pending;status('처리 완료. 현재 소속 재조회로 확인할 수 있습니다.');}catch(error){status(error.message+' 같은 요청 번호로 다시 확인하세요.',true);}finally{render();}
    });
    byId('verify').addEventListener('click',async()=>{
      if(!session.receipt?.result||session.busy)return;
      byId('verify').disabled=true;
      try{const t=session.receipt.target,[a,b]=await Promise.all([request('player-card?userId='+t.userId),request('player-card?userId='+t.removeMembers[0].userId)]);
        check(a.player?.id===t.userId&&a.player.clan?.id===t.clanId&&b.player?.id===t.removeMembers[0].userId&&!b.player.clan,'현재 소속을 다시 확인해야 합니다.');
        status(`재조회 확인: ${a.player.nickname} → ${a.player.clan.name} / ${b.player.nickname} → 무소속`);
      }catch(error){status('처리 영수증은 보존됩니다. '+error.message,true);}finally{render();}
    });
    render();status(session.receipt?'이전 요청 기록입니다. 같은 요청의 결과를 확인하세요.':'이적할 계정·대상 클랜·추방할 계정 1명을 지정하세요.');
  }catch(error){status(error.message,true);}
}
if(typeof document!=='undefined')boot();
