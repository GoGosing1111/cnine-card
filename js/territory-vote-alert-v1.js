(() => {
  'use strict';
  const storageKey='cnine-territory-vote-notices-v1';
  function pollsFor(state,now=Date.now()){
    const side=state?.mine?.side,counter=state?.counter;
    if(state?.mode==='OFF'||state?.round?.status!=='ACTIVE'||state?.mine?.status!=='ACTIVE'||
      !['A','B'].includes(side)||counter?.model!=='SKILL_COOLDOWN'||!counter.canVote||state.truce?.active||
      Date.parse(state.round.ends_at)<=now)return [];
    const required=Math.max(1,Number(counter.requiredVotes)||25);
    const prefix=`V25:${state.round.id}:${state.front?.id}:${side}:`;
    return Object.entries(counter[side]?.skills||{}).flatMap(([code,skill])=>{
      const votes=Math.max(0,Math.floor(Number(skill.votes)||0)),operation=counter.operations?.[code];
      if(!operation||!skill.ready||!votes||!String(skill.voteKey||'').startsWith(prefix+code+':'))return [];
      if(skill.readyAt&&Date.parse(skill.readyAt)>now)return [];
      return [{code,name:operation.name,key:`${state.mine.user_id}:${skill.voteKey}`,votes,required,voted:Boolean(skill.voted)}];
    }).sort((a,b)=>b.votes-a.votes||a.code.localeCompare(b.code));
  }
  function createTracker(storage){
    let saved=[];try{saved=JSON.parse(storage?.getItem(storageKey)||'[]');}catch{}
    const seen=new Set(Array.isArray(saved)?saved.filter(key=>typeof key==='string').slice(-160):[]);
    return {
      unseen:polls=>polls.filter(poll=>!seen.has(poll.key)&&!poll.voted),
      remember(polls){
        let changed=false;
        for(const poll of polls)if(!seen.has(poll.key)){seen.add(poll.key);changed=true;}
        if(!changed)return;
        while(seen.size>160)seen.delete(seen.values().next().value);
        try{storage?.setItem(storageKey,JSON.stringify([...seen]));}catch{}
      }
    };
  }
  let storage;try{storage=globalThis.sessionStorage;}catch{}
  const tracker=createTracker(storage);
  let notice=null,timer=0;
  function dispose(){clearTimeout(timer);timer=0;notice?.element.remove();notice=null;}
  function paintButtons(root,polls){
    const byCode=new Map(polls.map(poll=>[poll.code,poll]));
    root.querySelectorAll('[data-tw4-drawer="operations"],[data-tw3-operation]').forEach(button=>{
      const poll=byCode.get(button.dataset.tw3Operation),menu=button.dataset.tw4Drawer==='operations';
      const active=menu?polls.length>0:Boolean(poll);
      button.classList.toggle('tw-vote-active',active);
      const label=menu?(polls.length>1?`투표 ${polls.length}개`:'투표 중'):poll?`${poll.votes} / ${poll.required}명 투표 중`:'';
      if(button.dataset.twVoteLabel!==label)button.dataset.twVoteLabel=label;
      let badge=button.querySelector('.tw-vote-badge');
      if(menu&&active){
        if(!badge){badge=document.createElement('span');badge.className='tw-vote-badge';button.appendChild(badge);}
        if(badge.textContent!==label)badge.textContent=label;
      }else badge?.remove();
    });
  }
  function paintNotice(polls,state){
    const current=polls.filter(poll=>notice.keys.has(poll.key)&&!poll.voted);
    if(!current.length){dispose();return;}
    const first=current[0],count=current.length;
    const set=(part,text)=>{const node=notice.element.querySelector('[data-vote-'+part+']');if(node.textContent!==text)node.textContent=text;};
    set('context',(state.front?.node_name||state.nodes?.[Number(state.round.current_front_index)]?.name||'현재 거점')+' · 아군 스킬');
    set('name',first.name+(count>1?` 외 ${count-1}개`:''));
    set('count',first.votes>=first.required?`${first.votes} / ${first.required}명 · 발동 대기`:`${first.votes} / ${first.required}명 · 찬성표를 모으고 있습니다`);
  }
  function sync(root,state,{now=Date.now(),notify=true,open=()=>{}}={}){
    if(!root)return dispose();
    const polls=pollsFor(state,now);
    paintButtons(root,polls);
    // A player's own completed vote already has its normal confirmation toast.
    tracker.remember(polls.filter(poll=>poll.voted));
    if(notice){
      paintNotice(polls,state);
      if(notice&&!notice.element.isConnected)root.appendChild(notice.element);
    }
    const fresh=tracker.unseen(polls);
    if(!notify||!fresh.length||notice||root.ownerDocument.body.classList.contains('territory-war-drawer-open')||root.querySelector('.tw4-drawer-layer:not([hidden])'))return;
    tracker.remember(fresh);
    const element=document.createElement('aside');element.className='tw-vote-notice';
    element.setAttribute('aria-label','영토전 스킬 투표 알림');
    element.innerHTML='<div class="tw-vote-notice-copy" role="status" aria-live="polite" aria-atomic="true"><small data-vote-context></small><b>스킬 투표 진행 중</b><strong data-vote-name></strong><span data-vote-count></span></div><button type="button" class="tw-vote-open">투표 보기 <span aria-hidden="true">→</span></button><button type="button" class="tw-vote-dismiss" aria-label="투표 알림 닫기">×</button>';
    notice={element,keys:new Set(fresh.map(poll=>poll.key))};
    paintNotice(polls,state);root.appendChild(element);
    element.querySelector('.tw-vote-open').onclick=()=>{dispose();open();};
    element.querySelector('.tw-vote-dismiss').onclick=dispose;
    timer=setTimeout(dispose,8000);
  }
  globalThis.CNineTerritoryVoteAlert={sync,dispose,pollsFor,createTracker};
})();
