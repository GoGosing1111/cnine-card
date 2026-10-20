import { SKILLS } from './SkillPlan.mjs';
const $=id=>document.getElementById(id);
function select(id){
  const skill=SKILLS.find(s=>s.id===id);
  $('skill-name').textContent=skill.name;$('skill-type').textContent=skill.type;$('skill-description').textContent=skill.description;
  for(const b of document.querySelectorAll('[data-skill]'))b.setAttribute('aria-pressed',String(b.dataset.skill===id));
}
window.PrimeSelectLabel=select;
for(const s of SKILLS){
  const b=document.createElement('button');b.className='skill-choice';b.dataset.skill=s.id;b.disabled=true;b.setAttribute('aria-pressed','false');
  const img=document.createElement('img');img.src='assets/icon-'+s.id+'.png';img.alt='';img.width=76;img.height=76;
  const small=document.createElement('small');small.textContent=s.type;const name=document.createElement('strong');name.textContent=s.name;
  b.append(img,small,name);b.onclick=()=>{window.PrimePreview?.select(s.id,true);};$(s.showcase?'showcases':'skills').append(b);
}
select(SKILLS[0].id);
fetch('manifest.json').then(r=>{if(!r.ok)throw Error('manifest');return r.json();}).then(m=>{
  for(const [key,spec]of Object.entries(m.sheets)){
    const figure=document.createElement('figure');figure.className='sheet';const a=document.createElement('a');a.href=spec.path;a.target='_blank';
    const img=document.createElement('img');img.loading='lazy';img.src=spec.path;img.alt=spec.label+' 연속 스프라이트';a.append(img);
    const c=document.createElement('figcaption');c.textContent=spec.label+' · '+spec.frames.length+'프레임';figure.append(a,c);$('sheets').append(figure);
  }
}).catch(e=>$('health').textContent='제작 기록을 불러오지 못했습니다. '+e.message);
