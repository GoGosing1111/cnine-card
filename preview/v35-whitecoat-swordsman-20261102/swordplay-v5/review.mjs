const film=document.querySelector('#swordplay-film'), status=document.querySelector('#casting');
const toggle=document.querySelector('#play-toggle'), playbackStatus=document.querySelector('#playback-status');
const directory=film.dataset.directory||'swordplay-v5/qa/';
const playbackDirectory=film.dataset.playbackDirectory;
const firstCast=film.dataset.firstCast||'skill_flash';
const labels={
  aura_idle:'흑백 검기 · 먹빛과 은백색 기운이 몸통을 중심으로 앞뒤를 감쌉니다.',
  skill_flash:'절광발도 · 칼을 뽑는 궤적에서 은백색 반월 검광이 열립니다.',
  skill_thrust:'삼첩관통 · 관통한 자리에 세 겹의 예리한 검흔이 차례로 벌어집니다.',
  skill_wheel:'회천검압 · 회전베기에서 풀린 검압이 적 진형을 크게 가릅니다.',
  skill_rain:'만검낙성 · 내려베는 순간 적마다 검이 내리꽂히고 칼끝에서 강철 파편이 튑니다.'
};
let rows=[],current='four-skills.webm',active=firstCast,revision=0,pendingSeek=null;
const fallbackFiles=new Set();
const records=fetch(directory+'recording.json').then(r=>{
  if(!r.ok)throw Error('녹화 기록을 불러오지 못했습니다.');
  return r.json();
}).then(data=>rows=data.records).catch(()=>[]);
function source(file){
  const mp4=playbackDirectory&&!fallbackFiles.has(file)&&film.canPlayType('video/mp4; codecs="avc1.64002a"');
  return mp4?playbackDirectory+file.replace(/\.webm$/,'.mp4'):directory+file;
}
function updatePlayback(){
  if(toggle)toggle.textContent=film.paused?'재생':'일시정지';
  if(playbackStatus&&!film.error)playbackStatus.textContent=film.ended?'재생 완료':film.paused?'일시정지':'재생 중';
}
function showPlayError(error,version){
  if(version!==revision||error.name==='AbortError')return;
  if(playbackStatus)playbackStatus.textContent=error.name==='NotAllowedError'
    ?'재생을 누르면 시작합니다.'
    :'영상을 불러오지 못했습니다. 처음부터 버튼으로 다시 시도해 주세요.';
  if(toggle)toggle.textContent='재생';
}
function startPlayback(version){
  // Keep the original click activation: chapter data must not delay play().
  film.play()?.catch(error=>showPlayError(error,version));
}
function applySeek(){
  if(!pendingSeek||pendingSeek.version!==revision||film.readyState<1)return;
  film.currentTime=pendingSeek.time;
  pendingSeek=null;
}
function play(file,id=firstCast){
  const version=++revision;current=file;active=id;pendingSeek=null;
  const url=new URL(source(file),location.href).href;
  if((film.currentSrc||film.src)!==url){film.src=url;film.load();}
  film.playbackRate=1;
  // Full-film buttons restart; chapter buttons seek to their selected skill.
  const seekToChapter=()=>{
    if(version!==revision)return;
    const chapter=rows.find(r=>r.file===file)?.chapters.find(c=>c.id===id);
    pendingSeek={version,time:Math.max(0,(chapter?.start||0)-.065)};applySeek();
  };
  if(rows.length||id===firstCast)seekToChapter();else records.then(seekToChapter);
  for(const b of document.querySelectorAll('[data-film]'))b.setAttribute('aria-pressed',String(b.dataset.film===file));
  status.textContent=labels[id];
  if(playbackStatus)playbackStatus.textContent='영상을 불러오는 중입니다.';
  startPlayback(version);
}
film.addEventListener('loadedmetadata',applySeek);
for(const event of ['play','playing','pause','ended'])film.addEventListener(event,updatePlayback);
film.addEventListener('waiting',()=>{if(playbackStatus)playbackStatus.textContent='영상을 불러오는 중입니다.';});
film.addEventListener('error',()=>{
  if(playbackDirectory&&!fallbackFiles.has(current)&&!film.currentSrc.endsWith('.webm')){
    fallbackFiles.add(current);play(current,active);return;
  }
  showPlayError({name:'MediaError'},revision);
});
film.addEventListener('timeupdate',()=>{
  const chapters=rows.find(r=>r.file===current)?.chapters||[];
  const chapter=chapters.filter(c=>c.start-.09<=film.currentTime).at(-1);
  if(chapter){active=chapter.id;status.textContent=labels[active];}
});
for(const b of document.querySelectorAll('[data-film]'))b.onclick=()=>play(b.dataset.film);
for(const b of document.querySelectorAll('[data-cast]'))b.onclick=()=>play(current,b.dataset.cast);
if(toggle)toggle.onclick=()=>{
  if(film.ended||film.error)play(current);
  else if(film.paused)startPlayback(++revision);
  else {++revision;pendingSeek=null;film.pause();}
};
document.querySelector('#play-restart')?.addEventListener('click',()=>play(current));
document.querySelector('#play-loop')?.addEventListener('change',e=>film.loop=e.target.checked);
updatePlayback();
