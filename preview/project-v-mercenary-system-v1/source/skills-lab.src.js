// Bundle once with the existing V3 entry: esbuild deduplicates Pixi and GSAP.
import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter, TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MERCENARY_SKILLS, skillById, createSkillDraft, parseSkillDraft, validateSkillDraft, SKILL_STORAGE_KEY} from '../../../shared/mercenary-skills-v1.mjs';
import {ROLES, POSITIONS} from '../../../shared/mercenary-position-config-v1.mjs';
import {compileRehearsal, sampleRehearsal} from '../skill-rehearsal.mjs';
import {MercenarySkillFX} from './MercenarySkillFX.js';
import {skillAssetBaseUrl} from '../skill-asset-base.mjs';

const doc=window.parent.document,$=id=>doc.getElementById(id)||document.getElementById(id);
const ROOT='/preview/project-v-mercenary-system-v1/';
const FIXTURE_IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const abs=path=>'/'+String(path).replace(/^\//,'');
const getJson=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`자산을 불러오지 못했습니다: ${path}`);return r.json()};
let roster,positions,adapter,deck,engine,renderer,merc,fx,draft,savedRevision=null,changing=false,disposed=false,epoch=0;
let selected='MS-003',lastUi='',lastTick=-1,dirty=false;
const actors=new Map(),texturePaths=new Set();
const row=()=>draft.skills.find(s=>s.id===selected);
const base=()=>skillById(selected);
const card=()=>roster.cards.find(c=>c.code===base().code);
const notice=(text,error=false)=>{ $('notice').textContent=text;$('notice').classList.toggle('error',error)};
function controls(enabled){for(const e of doc.querySelectorAll('.controls button,.controls select,.scrubber input,#scenario'))e.disabled=!enabled;}
function list(){
  const q=$('search').value.trim().toLocaleLowerCase(),role=$('roleFilter').value;
  const items=MERCENARY_SKILLS.filter(s=>{
    const c=roster.cards.find(c=>c.code===s.code),d=draft.skills.find(d=>d.id===s.id);
    return (!role||s.role===role)&&(!q||`${c.name} ${s.code} ${d.name} ${s.effect} ${s.trigger}`.toLocaleLowerCase().includes(q));
  });
  $('count').textContent=`${items.length} / 16종`;
  $('skillList').innerHTML=items.map(s=>{const c=roster.cards.find(c=>c.code===s.code),d=draft.skills.find(d=>d.id===s.id);
    return `<button class="skill-row" type="button" data-skill="${s.id}" aria-pressed="${s.id===selected}"><img loading="lazy" src="/assets/ui/project-v/mercenaries/codex-v1/${s.code.toLowerCase()}-art-320.webp" alt=""><span><strong>${esc(d.name)}</strong><small>${esc(c.name)} · ${ROLES[s.role].label}</small></span></button>`;
  }).join('')||'<p>검색 결과가 없습니다.</p>';
}
function showDetails(){
  const s=base(),c=card(),d=row(),assignment=positions.assignments.find(a=>a.code===s.code);
  doc.documentElement.style.setProperty('--accent',s.visual.color);
  $('skillMeta').textContent=`${s.code} · ${c.name} · ${POSITIONS[assignment.position].label} / ${ROLES[s.role].label}`;
  $('skillName').textContent=d.name;$('skillEffect').textContent=s.effect;$('trigger').textContent=s.trigger;
  $('counterplay').textContent=s.counterplay;$('bossRule').textContent=s.bossRule;
  $('skillArt').src=`/assets/ui/project-v/mercenaries/codex-v1/${s.code.toLowerCase()}-art-640.webp`;
  $('skillArt').alt=`${c.name} 승인 카드 원화`;$('skillArt').hidden=false;
  $('steps').innerHTML=s.steps.map(step=>`<li>${esc(step)}</li>`).join('');
  $('editName').value=d.name;$('editReview').value=d.review;$('editNote').value=d.note;
  $('draftState').textContent=`수정 ${draft.revision}${dirty?' · 저장 전 변경 있음':' · 브라우저 초안'}`;
}
function actorName(id){if(id==='M')return card().name;const i=Number(id.slice(1))-1;return `${id.startsWith('E')?'적':'아군'} ${deck?.[i]?.name||id}`;}
function update(time,instance,sample){
  if(disposed)return;
  const plan=instance.plan,s=sample||sampleRehearsal(plan,time);
  $('scrub').max=plan.duration;$('scrub').value=time;$('time').value=`${time.toFixed(2)} / ${plan.duration.toFixed(2)}초`;
  $('play').textContent=instance.playing?'일시정지':'재생';$('cue').textContent=s.current?.label||'재생 대기';
  const key=`${selected}:${plan.scenario}:${s.events.length}`;
  if(key!==lastUi){
    lastUi=key;
    $('eventLog').innerHTML=plan.events.map(e=>`<li class="${e.at<=time?'active':''}" data-event="${e.id}"><time>${e.at.toFixed(2)}s</time><span>${esc(e.label)}</span></li>`).join('');
    const touched=new Set(['M',...plan.targets,...s.events.flatMap(e=>e.targets)]);
    $('stateLog').innerHTML=s.actors.filter(a=>touched.has(a.id)).map(a=>{
      const flags=Object.entries(a.flags).filter(([,v])=>Boolean(v)).map(([k,v])=>typeof v==='number'?`${k} ${v}`:k).join(' · ');
      return `<div class="actor-state"><span>${esc(actorName(a.id))}</span><span>HP ${Math.round(a.hp)}${a.shield>0?` · 방호 ${Math.round(a.shield)}`:''}</span>${flags?`<em>${esc(flags)}</em>`:''}</div>`;
    }).join('');
  }
  if(Math.floor(time*10)!==lastTick){lastTick=Math.floor(time*10);publishDiagnostics(instance);}
}
function publishDiagnostics(instance=fx){
  if(!instance)return;
  const snapshot={ready:!changing&&!disposed,skillId:selected,scenario:instance.plan.scenario,...instance.diagnostics(),
    regularCards:engine?.allies.length,mercenaries:merc?1:0,canvasCount:document.querySelectorAll('canvas').length,
    layerCount:engine?.effectLayer.children.filter(c=>c.label?.startsWith('MercenarySkill:')).length,
    mercenaryInRegularArray:engine?.allies.includes(merc),mercenaryDisplacement:merc?Math.hypot(merc.root.x-merc.baseX,merc.root.y-merc.baseY):0,
    sourceArt:card()?.sourceArt,battleSprite:card()?.battleSprite};
  $('health').dataset.diagnostics=JSON.stringify(snapshot);
}
function placeMercenary(){
  if(!merc||!engine)return;
  const position=positions.assignments.find(a=>a.code===base().code).position;
  const grid={FRONT:[3,3],MIDDLE:[1,4],REAR:[0,4]}[position];
  const p=engine.gridToScreen(...grid),scale=engine.perspectiveScale(.5*(engine.mobile?.84:1),p.y);
  merc.setFormation(p.x,p.y,scale);merc.setCompactHud?.(engine.mobile);merc.root.alpha=1;merc.root.visible=true;
  merc.root.depthSortY=p.y;engine.sortCombatDepth();
}
async function configure(id=selected){
  const token=++epoch;changing=true;controls(false);fx?.destroy();fx=null;selected=id;
  lastUi='';lastTick=-1;showDetails();list();$('health').textContent='선택한 용병과 전용 효과 준비 중…';
  try{
    const s=base(),c=card(),art=adapter.resolveForConsumer('BATTLE_FIELD',c.code);
    if(!art)throw new Error('승인 SD를 찾을 수 없습니다.');
    const artPath=`/assets/ui/project-v/mercenaries/codex-v1/${c.code.toLowerCase()}-art-640.webp`;
    const effectPath=`${ROOT}skill-assets/${s.visual.asset}.webp`;
    [art.spriteUrl,artPath,effectPath].forEach(p=>texturePaths.add(p));
    const [sd,cutin,texture]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(artPath),Assets.load(effectPath)]);
    if(disposed){for(const p of [art.spriteUrl,artPath,effectPath])void Assets.unload(p).catch(()=>{});return;}
    if(token!==epoch)return;
    if(!merc){merc=new BattleCharacter({id:'MERCENARY_PREVIEW',name:c.name,team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:260});engine.combatLayer.addChild(merc.root);actors.set('M',merc);}
    merc.name=c.name;merc.nameLabel.text=c.name;merc.cutInTexture=cutin;merc.useFullBodySprite(sd,260);
    merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);placeMercenary();
    const plan=compileRehearsal(s.id,$('scenario').value);
    $('scenarioNote').textContent=plan.explanation+($('scenario').value==='boss'?' 이 화면은 단일 표적에 보스 예외를 적용한 모의 상황입니다.':'');
    fx=new MercenarySkillFX(engine,actors,s,plan,texture,update);fx.setSpeed(Number($('speed').value));
    changing=false;controls(true);$('health').classList.remove('error');$('health').textContent='V3 WebGL · PixiJS 8.20.0 / GSAP 3.13.0 · 전용 효과 준비 완료';
    fx.render(0);publishDiagnostics();
  }catch(error){if(token!==epoch)return;changing=false;$('health').textContent=`검수 준비 실패: ${error.message}`;$('health').classList.add('error');console.error('[MercenarySkills]',error);}
}
function edit(){
  const d=row();d.name=$('editName').value;d.review=$('editReview').value;d.note=$('editNote').value;
  dirty=true;$('skillName').textContent=d.name;$('draftState').textContent=`수정 ${draft.revision} · 저장 전 변경 있음`;list();
}
function readStored(){const text=window.parent.localStorage.getItem(SKILL_STORAGE_KEY);return text?parseSkillDraft(text,roster.version):null;}
function save(){
  try{
    const checked=validateSkillDraft(draft,roster.version),stored=readStored();
    if((stored?.revision??null)!==savedRevision)throw new Error('다른 화면에서 저장본이 바뀌었습니다. JSON 내보내기로 현재 의견을 보존한 뒤 저장본을 불러오세요.');
    checked.revision=Math.max(checked.revision,savedRevision||0)+1;
    validateSkillDraft(checked,roster.version);window.parent.localStorage.setItem(SKILL_STORAGE_KEY,JSON.stringify(checked));
    draft=checked;savedRevision=draft.revision;dirty=false;showDetails();notice('스킬 16종의 검토 의견을 이 브라우저에 저장했습니다.');
  }catch(error){notice(error.message,true);}
}
function load(){try{const stored=readStored();if(!stored)throw new Error('이 브라우저에 저장된 초안이 없습니다.');draft=stored;savedRevision=draft.revision;dirty=false;showDetails();list();notice('브라우저 저장본을 불러왔습니다.');}catch(error){notice(error.message,true);}}
function exportDraft(){try{const checked=validateSkillDraft(draft,roster.version);const url=URL.createObjectURL(new Blob([JSON.stringify(checked,null,2)+'\n'],{type:'application/json'}));const a=doc.createElement('a');a.href=url;a.download='mercenary-skills-draft-v1.json';a.click();URL.revokeObjectURL(url);notice('스킬 초안을 JSON으로 내보냈습니다.');}catch(error){notice(error.message,true);}}
function bind(){
  $('skillList').addEventListener('click',event=>{const button=event.target.closest('[data-skill]');if(button)void configure(button.dataset.skill)});
  $('search').addEventListener('input',list);$('roleFilter').addEventListener('change',list);
  $('scenario').addEventListener('change',()=>void configure());
  $('play').addEventListener('click',()=>{if(!fx)return;fx.playing?fx.pause():fx.play();publishDiagnostics()});
  $('replay').addEventListener('click',()=>{fx?.seek(0);fx?.play();publishDiagnostics()});
  $('impact').addEventListener('click',()=>{fx?.seek(base().visual.impacts[0]+.08);publishDiagnostics()});
  $('cancel').addEventListener('click',()=>{fx?.cancel();publishDiagnostics()});
  $('scrub').addEventListener('input',()=>{fx?.seek(Number($('scrub').value));publishDiagnostics()});
  $('speed').addEventListener('change',()=>{fx?.setSpeed(Number($('speed').value));publishDiagnostics()});
  for(const id of ['editName','editReview','editNote'])$(id).addEventListener('input',edit);
  $('saveDraft').addEventListener('click',save);$('reloadDraft').addEventListener('click',load);$('exportDraft').addEventListener('click',exportDraft);
  $('importDraft').addEventListener('change',async event=>{
    try{const file=event.target.files?.[0];if(!file)return;if(file.size>48*1024)throw new Error('초안 파일은 48 KB 이하여야 합니다.');
      draft=parseSkillDraft(await file.text(),roster.version);dirty=true;showDetails();list();notice('가져온 초안을 검증했습니다. 브라우저 저장은 별도로 눌러 주세요.');
    }catch(error){notice(error.message,true)}finally{event.target.value='';}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){fx?.cancel();publishDiagnostics()}});
  window.addEventListener('resize',()=>{fx?.pause();placeMercenary();fx?.render(fx.time);publishDiagnostics()});
  window.addEventListener('pagehide',dispose,{once:true});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{fx?.cancel();controls(false);$('health').textContent='WebGL이 중단되었습니다. 새로고침해 주세요.'});
}
function dispose(){
  if(disposed)return;disposed=true;epoch++;fx?.destroy();fx=null;merc?.destroy?.();merc=null;
  renderer?.destroy();window.ProjectVPixiBattle?.destroy();actors.clear();
  // These textures are private to this iframe. Shared V3 textures are preserved by the engine.
  for(const p of texturePaths)void Assets.unload(p).catch(()=>{});texturePaths.clear();
}
async function loadDeck(){
  const manifests=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>getJson(`/assets/ui/project-v/characters/${p}`)));
  const rows=manifests.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  return FIXTURE_IDS.map((id,i)=>{const c=rows.find(c=>c.cardId===id);if(!c)throw new Error(`승인 카드가 없습니다: ${id}`);
    return {...c,id,cardId:id,name:c.member,title:c.title,image:abs(c.sourceArt),sourceArt:abs(c.sourceArt),originalCardArt:abs(c.sourceArt),power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};
  });
}
async function boot(){
  try{
    if(doc.readyState==='loading')await new Promise(resolve=>doc.addEventListener('DOMContentLoaded',resolve,{once:true}));
    await Assets.init({basePath:skillAssetBaseUrl(location.href)});
    [roster,positions,deck]=await Promise.all([getJson('/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'),getJson(`${ROOT}position-draft-v1.json`),loadDeck()]);
    adapter=createMercenaryBattleArtAdapter(roster);draft=createSkillDraft(roster.version);
    try{const stored=readStored();if(stored){draft=stored;savedRevision=stored.revision;}}catch(error){notice(`저장본 확인 필요: ${error.message}`,true);}
    $('roleFilter').innerHTML='<option value="">전체 역할</option>'+Object.entries(ROLES).map(([id,r])=>`<option value="${id}">${r.label}</option>`).join('');
    showDetails();list();window.cnineCardCatalog=()=>deck;
    const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
    const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine};
    const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'스킬 검수 편성',opponentName:'승인 카드 모의 표적',autoText:'공유 V3 전장 준비 중'});
    renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'스킬 검수 편성'});
    api.mountForBattle=mountForBattle;await engine.deployCards({instant:true,force:true});
    engine.allies.forEach((a,i)=>actors.set(`A${i+1}`,a));engine.enemies.forEach((a,i)=>actors.set(`E${i+1}`,a));
    prepared.phase.textContent='MERCENARY SKILL LAB';prepared.stage.querySelector('#pvBattleStatus').textContent='스킬 검수 · 모의 HP · 실제 계정 변경 없음';
    bind();for(const e of doc.querySelectorAll('.cms input,.cms select,.cms textarea,.cms button'))e.disabled=false;
    await configure();
    window.MercenarySkillLab={configure,dispose,get fx(){return fx},get engine(){return engine},diagnostics:()=>JSON.parse($('health').dataset.diagnostics||'{}')};
    window.parent.MercenarySkillLab=window.MercenarySkillLab;
  }catch(error){$('health').textContent=`전장 준비 실패: ${error.message}`;$('health').classList.add('error');console.error('[MercenarySkills]',error);}
}
if(window.parent===window)location.replace('./skills.html');
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
