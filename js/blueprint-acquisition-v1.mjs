const themes={
  apocalypse:{label:'아포칼립스',art:'/assets/ui/blueprint-reveal-apocalypse-v1.webp',tone:'#ff9b5f'},
  nox:{label:'종언의 주파수',art:'/assets/ui/blueprint-reveal-nox-v1.webp',tone:'#bda2ff'},
  defense:{label:'몬스터 디펜스',art:'/preview/coop-defense-v1/assets/reactor-breach-v1.webp',tone:'#ffbc6b'}
};
const shown=new Set();
const styleText=`
.bp-reveal{color:#fff6e3;box-sizing:border-box;position:fixed;width:min(610px,calc(100% - 24px));max-height:calc(100dvh - 32px);padding:0;overflow:auto;border:1px solid #a4824b;border-radius:12px;background:#100c14;text-align:center;box-shadow:0 22px 90px #000,0 0 48px color-mix(in srgb,var(--bp-tone) 25%, transparent);font-family:inherit}
.bp-reveal::backdrop{background:rgba(3,3,10,.78)}
.bp-reveal-scene{display:grid;justify-items:center;position:relative;isolation:isolate;min-height:330px;padding:24px 18px;background:radial-gradient(ellipse at 50% 48%,color-mix(in srgb,var(--bp-tone) 23%, transparent),transparent 69%)}
.bp-reveal-bg,.bp-reveal-scene::before{position:absolute;inset:0;width:100%;height:100%;z-index:-2;object-fit:cover}
.bp-reveal-scene::before{content:'';z-index:-1;background:linear-gradient(#0b0911ae,#0b091122 48%,#0b0911e8)}
.bp-reveal-origin{margin:0;color:var(--bp-tone);font-size:.82rem;letter-spacing:.12em;font-weight:750}
.bp-reveal-title{font-size:clamp(1.35rem,5vw,2rem);margin:6px 0 0;line-height:1.22;text-shadow:0 2px 16px #000}
.bp-reveal-art{width:min(315px,78vw,42vh);aspect-ratio:1;object-fit:contain;filter:drop-shadow(0 11px 20px #000);margin:-8px 0 -16px}
.bp-reveal-item{margin:0;font-size:clamp(1.12rem,4vw,1.48rem);color:#ffe6a7;line-height:1.25;text-shadow:0 2px 9px #000}
.bp-reveal-note{margin:8px 0 17px;font-size:.85rem;color:#dfd1bd}
.bp-reveal-close{padding:9px 22px;min-height:44px;font:inherit;font-weight:750;background:#241926;color:#fff2d0;border:1px solid #d6b775;border-radius:6px;cursor:pointer}
.bp-reveal-close:focus-visible{outline:2px solid #fff0ac;outline-offset:4px}
@media(prefers-reduced-motion:no-preference){
 .bp-reveal[open]{animation:bp-open .35s ease-out both}
 .bp-reveal-art{animation:bp-descent .8s cubic-bezier(.16,.75,.25,1) both}
 .bp-reveal-title,.bp-reveal-item{animation:bp-rise .48s .18s ease-out both}
 @keyframes bp-open{from{opacity:0;transform:scale(.985)}}
 @keyframes bp-descent{from{opacity:0;transform:translateY(-14px) scale(.87);filter:drop-shadow(0 0 22px var(--bp-tone))}to{opacity:1;transform:none}}
 @keyframes bp-rise{from{opacity:0;transform:translateY(5px)}}
}
@media(max-height:500px){.bp-reveal-scene{padding:12px;min-height:0}.bp-reveal-art{width:min(208px,48vh);margin:-4px 0 -11px}}
`;

function make(tag,kind,text){
  const node=document.createElement(tag);
  node.className=kind;
  if(text)node.textContent=text;
  return node;
}

export function showBlueprintAcquisition(drop,source,anchor){
  const theme=themes[source],match=/^(SCAR|M14)_BLUEPRINT_CHAPTER_([123])$/.exec(drop?.code);
  if(!theme||!match||!drop.eventId||!anchor?.isConnected)return;
  const [,weapon,chapter]=match;
  showAcquisition({key:source+':'+drop.eventId,theme,heading:'희귀 설계도 획득',
    image:'/assets/items/'+weapon.toLowerCase()+'-blueprint-chapter-'+chapter+'-v1.webp',
    name:weapon+' 설계도 '+chapter+'장',quantity:1});
}

export function showDefenseChipAcquisition(snapshot,playerId,anchor){
  if(snapshot?.phase!=='VICTORY'||!snapshot.id||!anchor?.isConnected)return;
  const reward=snapshot.clearRewards?.[playerId];
  const item=reward?.granted&&reward.items?.find(i=>i.code==='SKILL_CHIP_QUANTUM_BOMB'&&i.quantity>0);
  if(!item)return;
  const key='defense:'+snapshot.id+':'+playerId;
  if(shown.has(key))return;
  let history=[];
  try{history=JSON.parse(sessionStorage.getItem('defense-chip-reveals')||'[]');}catch{}
  if(!Array.isArray(history))history=[];
  if(history.includes(key)){shown.add(key);return;}
  if(showAcquisition({key,theme:themes.defense,heading:'희귀 스킬칩 획득',
    image:'/assets/ui/project-v/skill-chips/quantum-bomb-v1.webp',name:item.name||'양자폭탄 스킬칩',quantity:item.quantity})){
    try{sessionStorage.setItem('defense-chip-reveals',JSON.stringify([...history.slice(-49),key]));}catch{}
  }
}

function showAcquisition({key,theme,heading,image,name,quantity}){
  if(shown.has(key))return false;
  if(!document.getElementById('blueprint-reveal-style')){
    const style=document.createElement('style');
    style.id='blueprint-reveal-style';
    style.textContent=styleText;
    document.head.append(style);
  }
  const dialog=make('dialog','bp-reveal'),scene=make('div','bp-reveal-scene');
  dialog.setAttribute('aria-labelledby','blueprint-reveal-title');
  dialog.style.setProperty('--bp-tone',theme.tone);
  const bg=make('img','bp-reveal-bg'),art=make('img','bp-reveal-art'),title=make('h2','bp-reveal-title',heading);
  title.id='blueprint-reveal-title';
  bg.src=theme.art;bg.alt='';
  art.src=image;art.alt='';
  const close=make('button','bp-reveal-close','확인');
  close.type='button';
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  scene.append(bg,make('p','bp-reveal-origin',theme.label),title,art,
    make('p','bp-reveal-item',name),make('p','bp-reveal-note',quantity.toLocaleString('ko-KR')+'개가 인벤토리에 저장되었습니다.'),close);
  dialog.append(scene);
  document.body.append(dialog);
  try{dialog.showModal();shown.add(key);return true;}catch{dialog.remove();return false;}
}
