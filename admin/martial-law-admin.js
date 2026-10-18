(()=>{
'use strict';
let panel,allowed=false,busy=false,settings=null,offset=0,timer=null,sequence=0,pending=null;
const $=id=>panel?.querySelector('#'+id),syncKey='cnine:burning-event-sync-v1310';
const active=()=>settings?.enabled&&Date.parse(settings.endsAt)>Date.now()+offset;
function status(text,error=false){$('martialSaveState').textContent=text;$('martialSaveState').classList.toggle('error',error)}
function controls(){
 panel.querySelectorAll('select,button').forEach(node=>node.disabled=!allowed||busy||!settings);
 $('martialRevoke').disabled=!allowed||busy||!active();
 $('martialDeclare').disabled=!allowed||busy||!settings||!!active();
}
function countdown(){
 const live=active(),seconds=Math.max(0,Math.ceil((Date.parse(settings?.endsAt||'')-Date.now()-offset)/1000)||0);
 $('martialCmsState').textContent=live?'선포 중 · '+[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':'):'OFF · 해제 상태';
 $('martialCmsState').classList.toggle('off',!live);controls();
 if(settings?.enabled&&!live){settings.enabled=false;void load()}
}
async function request(method='GET',body){
 const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
 const response=await fetch('../api/admin/martial-law?_='+Date.now(),{method,cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'계엄령 요청에 실패했습니다.'),{status:response.status});
 const server=Date.parse(data.serverNow);if(Number.isFinite(server))offset=server-Date.now();return data;
}
function apply(data){settings=data.settings;countdown()}
async function load(){
 if(!allowed||busy)return;const seq=++sequence;
 try{const data=await request();if(seq!==sequence||!allowed||busy)return;apply(data);status('선포할 때 지속 시간을 선택하세요.')}
 catch(error){if(seq===sequence){status(error.message,true);controls()}}
}
async function save(enabled){
 if(!allowed||busy||!settings)return;
 const durationMinutes=Number($('martialDuration').value);
 if(!confirm(enabled?'계엄령을 '+durationMinutes+'분 동안 선포할까요?\n전투 코인 −10% · 행동력 충전 간격 ×3\nPVE·랭크전·아포칼립스에 적용됩니다.':'계엄령을 지금 해제할까요?'))return;
 if(!pending||pending.enabled!==enabled||pending.durationMinutes!==durationMinutes||pending.revision!==settings.revision)pending={enabled,durationMinutes,revision:settings.revision,requestId:crypto.randomUUID()};
 busy=true;sequence++;controls();status('서버에 반영하고 있습니다.');
 try{
  const data=await request('PATCH',pending);if(!allowed)return;pending=null;apply(data);
  status(data.settings.enabled?'계엄령이 선포되었습니다. 선택한 시간이 끝나면 자동 해제됩니다.':'계엄령이 해제되었습니다.');
  localStorage.setItem(syncKey,JSON.stringify({at:Date.now(),martialRevision:data.settings.revision}));
  window.dispatchEvent(new Event('soop:burning-updated'));
 }catch(error){if(error.status===409){pending=null;try{apply(await request())}catch{}}status(error.message+(error.status?'':' 같은 작업을 다시 누르면 중복 없이 확인합니다.'),true)}
 finally{busy=false;controls()}
}
function identity(value={}){
 allowed=String(value.role||'').trim().toUpperCase()==='OWNER'&&value.nickname==='핑크빛유두';sequence++;settings=null;pending=null;
 panel.classList.toggle('is-locked',!allowed);controls();
 $('martialAccess').textContent=allowed?'OWNER 핑크빛유두 전용 · 선포 및 해제 가능':'OWNER 핑크빛유두만 선포·해제할 수 있습니다.';
 clearInterval(timer);timer=null;
 if(allowed){void load();if(!document.hidden)timer=setInterval(countdown,1000)}
 else{$('martialCmsState').textContent='접근 제한';status('전용 운영자 계정으로 접속하세요.')}
}
function boot(){
 const grid=document.querySelector('.burningCmsGrid');if(!grid)return;
 panel=document.createElement('section');panel.id='martialLawCms';panel.className='martialCms martialPanel';
 panel.innerHTML='<div class="martialCmsHero" aria-hidden="true"></div><header class="martialCmsHeader"><div><small>REVERSE CALL · EMERGENCY ORDER</small><h2>계엄령</h2></div><span class="martialBadge martialCmsState off" id="martialCmsState">OFF · 해제 상태</span></header><p id="martialAccess" class="martialCmsAccess">전용 권한 확인 중</p><div class="martialEffects"><p><strong>전투 코인 −10%</strong><span>하이퍼 버닝과 동일한 전투 보상 범위</span></p><p><strong>행동력 충전 간격 ×3</strong><span>PVE · 랭크전 · 아포칼립스</span></p></div><div class="martialCmsControls"><label class="martialCmsDuration">선포 지속 시간<select id="martialDuration"><option value="30">30분</option><option value="60" selected>1시간</option><option value="120">2시간</option></select></label><button type="button" class="martialButton" id="martialDeclare">계엄령 선포</button><button type="button" class="martialButton" id="martialRevoke">즉시 해제</button><button type="button" class="martialButton" id="martialPreview">선포 화면 미리보기</button></div><p>선포한 동안 기존 전투 코인 보상에 ×0.9가 적용되고, 행동력 충전 간격은 기존의 3배가 됩니다. 진행 중인 버닝에도 적용되며 시간이 끝나면 자동 해제됩니다.</p><p id="martialSaveState" class="martialStatus" role="status"></p>';
 (document.getElementById('miracleBurningCms')||grid).after(panel);
 $('martialDeclare').onclick=()=>save(true);$('martialRevoke').onclick=()=>save(false);
 $('martialPreview').onclick=()=>window.CNineMartialLaw?.show({preview:true,durationMinutes:Number($('martialDuration').value)});
 window.addEventListener('soop:cms-identity',event=>identity(event.detail||{}));
 window.addEventListener('storage',event=>{if(event.key===syncKey)void load()});
 window.addEventListener('soop:burning-updated',()=>void load());
 document.addEventListener('visibilitychange',()=>{clearInterval(timer);timer=null;if(!document.hidden&&allowed){void load();timer=setInterval(countdown,1000)}});
 identity(globalThis.__SOOP_CMS_IDENTITY__||{});
}
document.addEventListener('DOMContentLoaded',boot);
})();

