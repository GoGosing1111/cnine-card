// The reviewed lobby lives in a shadow tree so legacy feature styles cannot
// change its layout. Existing live operations stay in a light-DOM slot: the
// original polling, countdowns, auction handlers and route binders own them.
(function(global){
  'use strict';
  const template=global.__ADVENTURE_LOBBY_TEMPLATE__;
  const fallbackArt='/assets/responsive/ui/chief-supreme-commander-lobby-v1-1024.webp';
  const safeArt=value=>{try{const url=new URL(String(value||fallbackArt).replace(/\\/g,'/'),location.origin);return url.origin===location.origin&&/^\/(assets|preview)\//.test(url.pathname)?url.href:fallbackArt;}catch{return fallbackArt;}};
  const compact=n=>{if(Number(n)<0)return '−'+compact(-Number(n));const v=Math.max(0,Number(n)||0);return v>=1e12?(v/1e12).toLocaleString('ko-KR',{maximumFractionDigits:1})+'조':v>=1e8?(v/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억':v>=1e4?(v/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만':v.toLocaleString('ko-KR');};
  class AdventureLobby extends HTMLElement{
    constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.innerHTML=template;this.model={};}
    connectedCallback(){
      const root=this.shadowRoot,scroller=root.querySelector('.lobby-body');this.lifecycle=new AbortController();
      const settings=this.navigationOptions||{},getUser=settings.getUser||(()=>global.loadUser?.()||{}),user=getUser();
      this.controls=global.SoopLobbyInteractions.mount(root,{scroller,accountId:user.serverUserId||user.id||'player',
        isRouteVisible:id=>id==='equipmentForge'||global.SoopketmonV21ExactShell?.isRouteVisible(id)!==false,
        navigate:async(id,href)=>{if(href){location.assign(href);return;}return global.SoopketmonV21ExactShell.navigate(id);},
        openChief:()=>global.SoopketmonV21ExactShell.openChief(),openAccount:()=>global.showAccountPanel?.(),...settings
      });
      const listen=(target,event,handler)=>target.addEventListener(event,handler,{signal:this.lifecycle.signal});
      listen(global,'cnine:player-updated',()=>this.update({user:getUser()}));
      listen(global,'storage',()=>this.update({user:getUser()}));
      listen(global,'cnine:messages-updated',event=>this.updateUnread(event.detail?.count));
      listen(global,'resize',()=>this.update(this.model));
      root.querySelector('.skip-link').onclick=event=>{event.preventDefault();const target=this.dataset.standalone?global.document.querySelector('body main'):this.dataset.view==='route'?this.parentElement.querySelector('.v21-route-body'):root.getElementById('main');if(target){target.tabIndex=-1;target.focus();}};
      root.getElementById('fullscreen-button').onclick=()=>global.SoopketmonV21ExactShell.toggleFullscreen();
      this.updateUnread(Number((global.document.querySelector('[data-message-new-badge]')?.textContent||'').match(/\d+/)?.[0]||0));
      this.update({user});
      global.dispatchEvent(new CustomEvent('cnine:pig-wallet-mounted'));
      this.setRoute(this.dataset.route||'home');
      this.layoutObserver=new ResizeObserver(()=>this.measureChrome());
      for(const el of root.querySelectorAll('.topbar,.sidebar,.mobile-dock'))this.layoutObserver.observe(el);
      this.measureChrome();
    }
    measureChrome(){
      const frame=this.parentElement;if(!frame)return;
      for(const [selector,key] of [['.topbar','header-height'],['.sidebar','rail-width'],['.mobile-dock','dock-height']]){
        const box=this.shadowRoot.querySelector(selector).getBoundingClientRect(),value=Math.ceil(key==='rail-width'?box.width:box.height)+'px';
        if(frame.style.getPropertyValue('--adventure-'+key)!==value)frame.style.setProperty('--adventure-'+key,value);
      }
    }
    setRoute(route){this.dataset.route=route;this.dataset.view=route==='home'?'home':'route';this.controls?.setRoute(route);}
    openMenu(category='all'){this.controls?.openMenu(category);}
    openRoutes(routes){this.controls?.openRoutes(routes);}
    update(model={}){
      this.model={...this.model,...model};const {user={},chief={}}=this.model,root=this.shadowRoot;
      const player=root.getElementById('player-name');player.textContent=user.nickname||'플레이어';player.title=user.nickname||'플레이어';
      let rankButton=root.getElementById('account-rank-button');
      if(!rankButton){
        rankButton=document.createElement('button');rankButton.id='account-rank-button';rankButton.type='button';rankButton.title='계급과 혜택';
        rankButton.className='account-rank-button';
        rankButton.addEventListener('click',async()=>{if(!global.AccountRank)await import('/js/account-rank-v1.mjs?v=2122&benefits=20260925');global.AccountRank.open();});
        const shortcut=root.getElementById('account-shortcut'),group=document.createElement('div');group.className='profile-summary account-identity';shortcut.className='account-name-shortcut';shortcut.before(group);group.append(shortcut,rankButton);
      }
      const accountRank=user.accountRank;
      if(accountRank){
        const rankArt=document.createElement('img');rankArt.src='/assets/ui/account-ranks-v1/'+String(accountRank.code).toLowerCase().replace(/[^a-z_]/g,'')+'-96.webp';rankArt.width=48;rankArt.height=48;rankArt.alt=accountRank.name+' 계급장';
        const rankLabel=document.createElement('span');rankLabel.className='account-rank-label';const rankLevel=document.createElement('span'),rankName=document.createElement('span');rankLevel.className='account-rank-level';rankName.className='account-rank-name';rankLevel.textContent='Lv.'+Number(accountRank.level);rankName.textContent=accountRank.name;rankLabel.append(rankLevel,rankName);
        const progress=accountRank.progress,xp=document.createElement('span');xp.className='account-rank-xp';
        const caption=document.createElement('span'),track=document.createElement('span'),fill=document.createElement('span');caption.className='account-rank-xp-caption';track.className='account-rank-xp-track';fill.className='account-rank-xp-fill';
        const ratio=Math.max(0,Math.min(100,Number(progress?.percent)||0)),format=n=>Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:3});
        caption.textContent=progress?.maxed?'MAX LEVEL':progress?`EXP ${format(progress.current)} / ${format(progress.required)}`:'EXP 확인 중';
        track.setAttribute('role','progressbar');track.setAttribute('aria-label','계정 경험치');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');if(progress)track.setAttribute('aria-valuenow',String(ratio));track.setAttribute('aria-valuetext',progress?.maxed?'최고 레벨':caption.textContent);fill.style.width=ratio+'%';track.append(fill);xp.append(caption,track);
        rankButton.title=`Lv.${Number(accountRank.level)} ${accountRank.name} · ${caption.textContent} · 계급과 혜택`;rankButton.replaceChildren(rankArt,rankLabel,xp);rankButton.hidden=false;
      }else rankButton.hidden=true;
      for(const [id,key] of [['wallet-coin','coin'],['wallet-shards','cardShards'],['wallet-stars','masterStars']]){const el=root.getElementById(id),amount=key==='coin'?(Number(user[key])||0):Math.max(0,Number(user[key])||0);el.textContent=compact(amount);el.parentElement.title=amount.toLocaleString('ko-KR');el.setAttribute('aria-label',amount.toLocaleString('ko-KR'));}
      const name=root.getElementById('chief-name');name.textContent=chief.state==='suspended'?`${chief.nickname} · 직무정지`:chief.state==='active'?chief.nickname:chief.state==='vacant'?'선출 대기':chief.state==='unavailable'?'확인 불가':'확인 중';
      root.getElementById('chief-shortcut').title=chief.state==='active'?`${chief.title} ${chief.nickname} · ${chief.remaining}`:'족장 정보';
      const avatar=chief.viewerAvatar||chief.avatar,art=root.querySelector('.stage-character');
      const src=safeArt(innerWidth<=759?(avatar?.lobbyMobileImage||avatar?.lobbyImage):avatar?.lobbyImage);
      if(art.src!==new URL(src,location.origin).href)art.src=src;
      art.alt=avatar?.name?`${avatar.name} · 로비 아바타`:'족장 직위를 상징하는 공용 로비 일러스트';
      this.controls?.refreshMenus();
    }
    updateUnread(value){const count=Math.max(0,Number(value)||0),badge=this.shadowRoot.getElementById('inbox-count');badge.textContent=count>99?'99+':String(count);badge.hidden=!count;badge.parentElement.setAttribute('aria-label',count?`메시지함 · 새 메시지 ${count}개`:'메시지함');}
    refreshMenus(){this.controls?.refreshMenus();}
    disconnectedCallback(){this.lifecycle?.abort();this.layoutObserver?.disconnect();this.controls?.destroy();this.controls=null;}
  }
  customElements.define('soop-adventure-lobby',AdventureLobby);
  global.SoopAdventureLobby=Object.freeze({create(options={}){const element=global.document.createElement('soop-adventure-lobby');element.navigationOptions=options;return element;}});
})(window);
