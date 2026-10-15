const $=id=>document.getElementById(id),api=window.soopLauncher;
let current;
const bytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n.toLocaleString()+' B';
function render(s){
  current=s;document.body.classList.toggle('error',s.phase==='error');
  $('clientVersion').textContent=s.clientVersion;$('statusTitle').textContent=s.title;$('statusDescription').textContent=s.description;
  const busy=['checking','downloading'].includes(s.phase)||s.clientUpdate?.status==='installing',playing=s.phase==='playing';
  $('phaseLabel').textContent=({checking:'업데이트',downloading:'리소스 준비',available:'설치 · 업데이트',ready:'준비 완료',playing:'플레이 중',error:'확인 필요'})[s.phase]||'준비';
  const progress=s.progress,ratio=progress?.downloadTotal?progress.transferred/progress.downloadTotal:progress?.files?progress.done/progress.files:s.ready?1:0,percent=Math.min(100,Math.floor(ratio*100));
  $('progressFill').style.width=percent+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(percent));
  $('progressText').textContent=progress?`${progress.downloadTotal?`다운로드 ${bytes(progress.transferred)} / ${bytes(progress.downloadTotal)}`:'추가 다운로드 없음'} · 파일 확인 ${progress.done.toLocaleString()} / ${progress.files.toLocaleString()}`:s.ready?'최신 상태 · 추가 다운로드 없음':s.phase==='checking'?'업데이트 정보와 저장된 파일 확인 중':s.plan?.downloadBytes?`필요한 다운로드 ${bytes(s.plan.downloadBytes)}`:s.phase==='playing'?'저장된 리소스로 플레이 중':'인터넷 연결이 필요합니다.';
  $('releaseLabel').textContent=s.releaseId?'리소스 버전 '+s.releaseId:'기존 웹·PWA와 같은 계정으로 이용';
  $('storedBytes').textContent=bytes(s.stats?.bytes||0);$('storedCount').textContent=`저장된 파일 ${(s.stats?.count||0).toLocaleString()}개`;
  $('checkButton').disabled=busy||playing;$('repairButton').disabled=busy||playing||!s.plan;
  $('cancelButton').hidden=s.phase!=='downloading';
  $('playButton').disabled=busy;
  $('playLabel').textContent=({checking:'확인 중',downloading:'준비 중',available:'다운로드',ready:'게임 시작',playing:'게임으로 돌아가기',error:'다시 확인'})[s.phase]||'게임 시작';
  $('notice').hidden=!s.notice;$('notice').textContent=s.notice||'';
  const update=s.clientUpdate||{},status=update.status;
  $('clientUpdate').hidden=!['downloading','ready','installing','error'].includes(status);
  $('clientUpdateTitle').textContent=({downloading:`런처 ${update.version} 다운로드 중`,ready:`새 런처 ${update.version} 준비 완료`,installing:'런처 업데이트 적용 중',error:'런처 업데이트를 확인하지 못했습니다'})[status]||'';
  $('clientUpdateDescription').textContent=({
    downloading:update.progress?.total?`${bytes(update.progress.bytes)} / ${bytes(update.progress.total)} · 게임을 계속 이용할 수 있습니다.`:'새 버전을 준비합니다. 게임을 계속 이용할 수 있습니다.',
    ready:s.gameOpen?'게임 창을 모두 닫으면 업데이트할 수 있습니다.':busy?'게임 파일 준비가 끝나면 다시 시작할 수 있습니다.':'다시 시작하면 적용됩니다. 로그인 정보와 화면 크기는 유지됩니다.',
    installing:'잠시 후 새 버전으로 다시 열립니다.',
    error:'게임은 계속 이용할 수 있습니다. 나중에 ‘업데이트 확인’을 눌러 주세요.'
  })[status]||'';
  $('clientUpdateProgress').hidden=status!=='downloading';
  $('clientUpdateProgress').value=update.progress?.total?Math.min(100,update.progress.bytes/update.progress.total*100):0;
  $('restartClientButton').hidden=status!=='ready';$('restartClientButton').disabled=busy||Boolean(s.gameOpen);
}
async function command(name){try{await api.command(name);}catch(error){$('notice').hidden=false;$('notice').textContent=error.message;}}
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.command)));
$('playButton').addEventListener('click',()=>command(current?.phase==='error'?'check':current?.phase==='available'?'install':'play'));
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-panel]').forEach(b=>{const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  $('viewTitle').textContent=({game:'게임 홈',resources:'리소스 관리',help:'이용 안내'})[button.dataset.panel];
  for(const name of ['game','resources','help'])$(name+'Panel').hidden=name!==button.dataset.panel;
}));
api.onState(render);api.getState().then(render);
