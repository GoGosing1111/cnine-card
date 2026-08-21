/* Runtime-only Nightmare presentation. Existing monster artwork is never replaced. */
(()=>{
  const NIGHTMARE_TAB='NIGHTMARE';
  const LEGACY_TAB={GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'};
  const currentTab=()=>{try{return String(JSON.parse(localStorage.getItem('cnine_pve_monster_filter')||'{}').tab||'NORMAL').toUpperCase()}catch{return 'NORMAL'}};
  const nightmareSelected=()=>currentTab()===NIGHTMARE_TAB;

  // V1800: 전투 화면 표시는 "저장된 PVE 탭"이 아니라 "지금 싸우는 상대"로 판단한다.
  //
  // 예전에는 decorateBattle() 이 nightmareSelected() 하나만 보고 마크를 붙였다.
  // 그 값은 localStorage 에 남는 PVE 목록 탭이라, 나이트메어 탭을 한 번이라도
  // 눌러 둔 유저는 그 뒤로 PVP·무한의탑·레이드·봉인전까지 전부 우측 상단에
  // NIGHTMARE 가 붙었다. 게다가 조건이 안 맞으면 그냥 return 해서 이미 붙은
  // 마크를 떼지도 않았다.
  const monsterState=()=>{try{return typeof battleState!=='undefined'?battleState:null}catch{return null}};
  function selectedMonsterIsNightmare(){
    const state=monsterState();
    const monsters=Array.isArray(state?.monsters)?state.monsters:[];
    const monster=monsters.find(m=>Number(m?.id)===Number(state?.selectedMonster));
    if(!monster)return false;
    const raw=String(monster.pveTab||monster.category||(monster.isBoss?'HELL':'NORMAL')).toUpperCase();
    return (LEGACY_TAB[raw]||raw)===NIGHTMARE_TAB;
  }
  function stageIsNightmare(stage){
    // V3 셸은 data-v3-field 로 전장 종류를 알려준다. PVE 몬스터 토벌(HUNT)이 아니면
    // 나이트메어일 수 없다. 필드 정보가 없는 구형 셸은 PVP 모달만 걸러낸다.
    const field=String(stage?.dataset?.v3Field||'').toUpperCase();
    if(field&&field!=='HUNT')return false;
    if(!field&&stage?.closest?.('.pvp-battle-modal'))return false;
    return selectedMonsterIsNightmare();
  }

  function decorateBrowser(){
    const root=document.querySelector('#battleMonsters .pve-monster-browser');if(!root)return;
    const active=nightmareSelected();root.classList.toggle('nightmare-active',active);
    root.querySelector('[data-monster-tab="NIGHTMARE"]')?.classList.add('nightmare-tab');
    root.querySelectorAll('.monster-choice').forEach(card=>card.classList.toggle('nightmare-monster',active));
    const spotlight=root.querySelector('.pve-target-spotlight');if(!spotlight)return;
    spotlight.classList.toggle('nightmare-target',active);
    let badge=spotlight.querySelector('.nightmare-target-emblem');
    if(active&&!badge){
      badge=document.createElement('div');badge.className='nightmare-target-emblem';badge.innerHTML='<i aria-hidden="true"></i><span><small>PVE EXCLUSIVE</small><b>NIGHTMARE</b></span>';spotlight.append(badge);
    }else if(!active&&badge)badge.remove();
  }
  function decorateBattle(){
    // 조건이 안 맞으면 조용히 나가지 않고, 이전에 붙은 마크를 반드시 걷어낸다.
    document.querySelectorAll('#modal .battle-stage,#modal .battle-v2-live-stage,#modal [data-battle-v2-stage]').forEach(stage=>{
      const active=stageIsNightmare(stage);
      stage.classList.toggle('nightmare-battle',active);
      const mark=stage.querySelector('.nightmare-battle-mark');
      if(!active){if(mark)mark.remove();return}
      if(mark)return;
      const next=document.createElement('div');next.className='nightmare-battle-mark';next.innerHTML='<i></i><b>NIGHTMARE</b><small>DAMAGE LIMIT RELEASED</small>';stage.append(next);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    let observedBrowserRoot=null,observedModal=null;
    function attach(){
      const browserRoot=document.getElementById('battleMonsters'),modal=document.getElementById('modal');
      if(browserRoot&&browserRoot!==observedBrowserRoot){new MutationObserver(decorateBrowser).observe(browserRoot,{childList:true,subtree:true});observedBrowserRoot=browserRoot;decorateBrowser()}
      if(modal&&modal!==observedModal){new MutationObserver(decorateBattle).observe(modal,{childList:true,subtree:true});observedModal=modal;decorateBattle()}
    }
    const app=document.getElementById('app');if(app)new MutationObserver(attach).observe(app,{childList:true});attach();
  });
})();
