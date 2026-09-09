const ENDPOINT='admin/avatars/grant';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const labels={NEW:'신규 지급',ALREADY_OWNED:'영구 보유 · 건너뜀',PERMANENT_UPGRADE:'영구 전환'};
export function grantNicknames(value){
  const names=String(value).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  check(names.length>0&&names.length<=30&&names.every(n=>n.length<=80),'닉네임을 한 줄에 한 명씩, 최대 30명 입력하세요.');
  check(new Set(names).size===names.length,'중복 닉네임을 제거하세요.');return names;
}
function validate(response,prior=null){
  check(response?.ok&&['PREVIEW','COMPLETED','CANCELLED','EXPIRED'].includes(response.status)&&response.permanent===true
    &&/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(response.previewId)&&response.avatar?.code&&Array.isArray(response.recipients)
    &&response.recipients.length>0&&response.recipients.length<=30,'지급 응답을 확인할 수 없습니다.');
  check(response.recipients.every(u=>Number.isSafeInteger(u.userId)&&u.userId>0&&typeof u.nickname==='string'&&labels[u.outcome])
    &&new Set(response.recipients.map(u=>u.userId)).size===response.recipients.length,'지급 대상 응답이 올바르지 않습니다.');
  if(prior)check(prior.previewId===response.previewId&&prior.avatar.code===response.avatar.code
    &&prior.recipients.length===response.recipients.length&&prior.recipients.every((u,i)=>u.userId===response.recipients[i].userId&&u.nickname===response.recipients[i].nickname),'기존 지급 요청과 다른 응답입니다.');
  return response;
}
export class AvatarGrantSession{
  constructor(request,save,receipt=null){this.request=request;this.save=save;this.receipt=receipt;this.busy=false;if(receipt)validate(receipt.data);}
  async preview(input){
    check(!this.busy&&!this.receipt?.started,'진행 중인 지급 결과를 먼저 확인하세요.');this.busy=true;
    try{
      const data=validate(await this.request(ENDPOINT,{action:'preview',...input}));
      check(data.avatar.code===input.avatarCode&&data.recipients.length===input.nicknames.length
        &&data.recipients.every(u=>input.nicknames.includes(u.nickname)),'조회한 대상이 입력한 계정과 다릅니다.');
      this.save({data,started:false});this.receipt={data,started:false};return data;
    }finally{this.busy=false;}
  }
  async send(action){
    check(!this.busy&&this.receipt,'지급 대상을 먼저 확인하세요.');
    if(this.receipt.data.status==='COMPLETED')return this.receipt.data;
    this.busy=true;
    try{
      if(action==='apply'){this.save({...this.receipt,started:true});this.receipt={...this.receipt,started:true};}
      const data=validate(await this.request(ENDPOINT,{action,previewId:this.receipt.data.previewId,
        ...(action==='apply'?{confirmation:'GRANT_PERMANENT_AVATAR'}:{})}),this.receipt.data);
      const receipt={...this.receipt,data};this.save(receipt);this.receipt=receipt;return data;
    }finally{this.busy=false;}
  }
  reset(){check(!this.busy&&(!this.receipt?.started||['COMPLETED','CANCELLED','EXPIRED'].includes(this.receipt.data.status)),'미확인 지급은 취소하거나 결과를 확인하세요.');this.save(null);this.receipt=null;}
}

async function boot(){
  const $=id=>document.getElementById(id),status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
  try{
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token');check(token,'CMS에서 OWNER로 로그인하세요.');
    const request=async(path,body)=>{
      const response=await fetch('/api/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+token},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();check(response.ok,data.error||'서버 요청에 실패했습니다.');return data;
    };
    const catalog=await request('admin/avatars'),owner=catalog.grantAccess;
    check(Number.isSafeInteger(owner?.ownerId)&&owner.ownerId>0,'OWNER만 아바타를 지급할 수 있습니다.');
    $('owner').textContent=`${owner.nickname} · OWNER 인증됨`;
    const avatars=catalog.avatars.filter(a=>a.active&&a.public);
    for(const avatar of avatars){const o=document.createElement('option');o.value=avatar.code;o.textContent=`${avatar.name} · ${avatar.serial}`;$('avatar').append(o);}
    const key='cnine_avatar_grant_v2079:'+owner.ownerId;
    const session=new AvatarGrantSession(request,r=>{if(r)localStorage.setItem(key,JSON.stringify(r));else localStorage.removeItem(key);},JSON.parse(localStorage.getItem(key)||'null'));
    const render=()=>{
      const r=session.receipt,d=r?.data,finished=d&&['COMPLETED','CANCELLED','EXPIRED'].includes(d.status);
      $('fields').disabled=session.busy||Boolean(r);
      $('summary').hidden=!d;$('approval').hidden=!d||Boolean(finished)||Boolean(r?.started);
      $('apply').hidden=!d||Boolean(finished);$('apply').disabled=session.busy||(!r?.started&&!$('confirm').checked);
      $('apply').textContent=r?.started?'같은 요청으로 지급 재확인':'확인한 계정에 지급';
      $('refreshResult').hidden=!d||Boolean(finished);$('refreshResult').disabled=session.busy;
      $('cancel').hidden=!d||Boolean(finished);$('cancel').disabled=session.busy;
      $('next').hidden=!finished;$('next').disabled=session.busy;
      if(!d)return;
      $('summaryTitle').textContent=`${d.avatar.name} · ${d.status==='COMPLETED'?'지급 완료':d.status==='CANCELLED'?'취소됨':d.status==='EXPIRED'?'확인 만료':'영구 지급 확인'}`;
      $('summaryReason').textContent=d.reason;$('receiptId').textContent=`요청 번호 ${d.previewId}${d.completedAt?' · '+new Date(d.completedAt).toLocaleString('ko-KR'):''}`;
      $('recipients').replaceChildren();
      for(const u of d.recipients){const li=document.createElement('li'),identity=document.createElement('div'),name=document.createElement('strong'),id=document.createElement('small'),outcome=document.createElement('b');
        li.dataset.outcome=u.outcome;name.textContent=u.nickname;id.textContent='ID '+u.userId;outcome.textContent=labels[u.outcome];identity.append(name,id);li.append(identity,outcome);$('recipients').append(li);}
    };
    $('avatar').onchange=()=>{
      const a=avatars.find(a=>a.code===$('avatar').value);$('art').hidden=!a;
      if(a){$('avatarName').textContent=a.name;$('portrait').alt=a.name;
        const image=a.lobbyMobileImage||a.lobbyImage;
        if(/^(assets\/|preview\/avatar-)[a-zA-Z0-9_./-]+\.(png|webp|jpe?g|avif)$/.test(image)&&!image.includes('..'))$('portrait').src='/'+image;else $('portrait').removeAttribute('src');}
    };
    $('confirm').onchange=render;
    $('grantForm').onsubmit=async event=>{
      event.preventDefault();if(session.busy||session.receipt)return;
      try{
        const pending=session.preview({avatarCode:$('avatar').value,nicknames:grantNicknames($('nicknames').value),reason:$('reason').value.trim()});
        render();status('계정과 현재 보유 상태를 확인하고 있습니다.');await pending;$('confirm').checked=false;status('지급할 계정과 아바타를 확인한 후 지급하세요.');
      }catch(error){status(error.message,true);}finally{render();}
    };
    for(const [id,action] of [['apply','apply'],['refreshResult','status'],['cancel','cancel']])$(id).onclick=async()=>{
      if(session.busy||!session.receipt||(action==='apply'&&!session.receipt.started&&!$('confirm').checked))return;
      const pending=session.send(action);render();status('같은 요청 번호로 서버 결과를 확인하고 있습니다.');
      try{const d=await pending;status(d.status==='COMPLETED'?`${d.granted}명 지급 · ${d.alreadyOwned}명 영구 보유 유지. 장착 상태는 변경하지 않았습니다.`:
        d.status==='CANCELLED'?'미처리 요청을 취소했습니다.':d.status==='EXPIRED'?'확인이 만료되었습니다. 새로 조회하세요.':'아직 지급 전입니다. 같은 요청으로 지급하거나 취소할 수 있습니다.');
      }catch(error){status(error.message+' 결과 확인 또는 미처리 요청 취소를 이용하세요.',true);}finally{render();}
    };
    $('next').onclick=()=>{session.reset();$('confirm').checked=false;$('nicknames').value='';render();status('다음 지급 대상을 입력하세요.');$('nicknames').focus();};
    if(session.receipt){const d=session.receipt.data;$('avatar').value=d.avatar.code;$('nicknames').value=d.recipients.map(u=>u.nickname).join('\n');$('reason').value=d.reason;$('avatar').onchange();}
    render();status(session.receipt?'저장된 지급 요청입니다. 이전 결과를 확인하세요.':'아바타와 닉네임을 입력하세요. 대상 확인 단계에서는 지급되지 않습니다.');
  }catch(error){status(error.message,true);}
}
if(typeof document!=='undefined')boot();
