const $=id=>document.getElementById(id),api=window.soopLauncher;
let current;
const bytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(n<1024**2?2:1)+' MB';
function render(s){
  current=s;document.body.classList.toggle('error',s.phase==='error');
  $('clientVersion').textContent=s.clientVersion;$('statusTitle').textContent=s.title;$('statusDescription').textContent=s.description;
  const busy=['checking','downloading'].includes(s.phase),playing=s.phase==='playing';
  $('phaseLabel').textContent=({checking:'업데이트',downloading:'리소스 준비',available:'설치 · 업데이트',ready:'준비 완료',playing:'플레이 중',error:'확인 필요'})[s.phase]||'준비';
  const progress=s.progress,percent=progress?.total?Math.min(100,Math.floor(progress.bytes/progress.total*100)):s.ready?100:0;
  $('progressFill').style.width=percent+'%';document.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(percent));
  $('progressText').textContent=progress?`${progress.done.toLocaleString()} / ${progress.files.toLocaleString()} 파일 · ${bytes(progress.bytes)} / ${bytes(progress.total)}`:s.plan?.downloadBytes?`필요한 다운로드 ${bytes(s.plan.downloadBytes)}`:s.ready?'필수 파일 준비 완료':'인터넷 연결이 필요합니다.';
  $('releaseLabel').textContent=s.releaseId?'리소스 버전 '+s.releaseId:'기존 웹·PWA와 같은 계정으로 이용';
  $('storedBytes').textContent=bytes(s.stats?.bytes||0);$('storedCount').textContent=`저장된 파일 ${(s.stats?.count||0).toLocaleString()}개`;
  $('checkButton').disabled=busy||playing;$('repairButton').disabled=busy||playing||!s.plan;
  $('cancelButton').hidden=s.phase!=='downloading';
  $('playButton').disabled=busy;
  $('playLabel').textContent=({checking:'확인 중',downloading:'준비 중',available:'다운로드',ready:'게임 시작',playing:'게임으로 돌아가기',error:'다시 확인'})[s.phase]||'게임 시작';
  $('notice').hidden=!s.notice;$('notice').textContent=s.notice||'';
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
