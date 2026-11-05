const film=document.querySelector('#swordplay-film'), status=document.querySelector('#casting');
const directory='swordplay-v5/qa/';
const labels={
  skill_flash:'절광발도 · 칼을 뽑는 궤적에서 은백색 반월 검광이 열립니다.',
  skill_thrust:'삼첩관통 · 관통한 자리에 세 겹의 예리한 검흔이 차례로 벌어집니다.',
  skill_wheel:'회천검압 · 회전베기에서 풀린 검압이 적 진형을 크게 가릅니다.',
  skill_rain:'만검낙성 · 내려베는 순간 적마다 검이 내리꽂히고 칼끝에서 강철 파편이 튑니다.'
};
const records=fetch(directory+'recording.json').then(r=>{
  if(!r.ok)throw Error('녹화 기록을 불러오지 못했습니다.');
  return r.json();
}).then(data=>data.records);
let current='four-skills.webm', active='skill_flash', revision=0;
async function play(file,id){
  const version=++revision;
  try{
    const entry=(await records).find(r=>r.file===file);
    const chapter=entry?.chapters.find(c=>c.id===id);
    if(!chapter || version!==revision)return;
    if(file!==current){
      current=file;
      film.src=directory+file;
    }
    if(film.readyState<1)await new Promise(resolve=>film.addEventListener('loadedmetadata',resolve,{once:true}));
    if(version!==revision)return;
    active=id;film.playbackRate=1;
    film.currentTime=Math.max(0,chapter.start-.065);
    for(const b of document.querySelectorAll('[data-film]'))b.setAttribute('aria-pressed',String(b.dataset.film===file));
    status.textContent=labels[id];
    await film.play();
  }catch(error){if(error.name!=='AbortError' && version===revision)status.textContent='영상의 재생 버튼을 눌러 주세요.';}
}
for(const b of document.querySelectorAll('[data-film]'))b.onclick=()=>play(b.dataset.film,active);
for(const b of document.querySelectorAll('[data-cast]'))b.onclick=()=>play(current,b.dataset.cast);
records.then(rows=>{
  film.addEventListener('timeupdate',()=>{
    const chapters=rows.find(r=>r.file===current)?.chapters || [];
    const chapter=chapters.filter(c=>c.start-.09<=film.currentTime).at(-1);
    if(chapter){active=chapter.id;status.textContent=labels[active];}
  });
}).catch(()=>{status.textContent='재생 버튼으로 네 기술을 연속해서 볼 수 있습니다.';});
