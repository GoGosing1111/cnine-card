(() => {
  'use strict';
  const art='/assets/ui/territory-war/frontline-20261108/';
  const coords=[[9,49],[28,26],[72,26],[29,50],[50,44],[71,50],[27,75],[73,75],[91,49]];
  const legacyCoords=[[9,25],[29,25],[50,25],[71,25],[71,50],[50,50],[29,50],[29,76],[59,76]];
  const sites={HOME:['hq','야전 지휘본부'],OUTPOST:['outpost','전방 막사'],MID:['depot','군수 보급창'],GATE:['gate','차량 검문소'],CENTER:['relay','철교 통제소']};
  const siteFor=(node,index)=>{const [key,name]=sites[node?.type]||sites[['HOME','OUTPOST','MID','GATE','CENTER','GATE','MID','OUTPOST','HOME'][index]]||sites.CENTER;return {key,name,scene:art+'site-'+key+'-scene.webp'};};
  const maps='/assets/ui/territory-war/frontline-20261109/';
  const requestedImages=new Set();
  function warmMapImages(){
    for(const file of [matchMedia('(max-width:820px)').matches?'terrain-mobile.webp':'terrain-wide.webp','hud.webp']){
      if(requestedImages.has(file))continue;
      requestedImages.add(file);
      const image=new Image();
      image.decoding='async';image.src=maps+file;
      image.onerror=()=>requestedImages.delete(file);
    }
  }
  const shapes={
    advance:'M5 21V3m1 1c5-3 7 3 13 0v9c-6 3-9-3-13 0',
    defend:'M12 2 21 6v6c0 4-4 8-9 10-5-2-9-6-9-10V6z M8 12l3 3 5-6',
    wait:'M6 3h12M6 21h12M7 3v3c0 3 3 4 5 6-2 2-5 3-5 6v3m10-18v3c0 3-3 4-5 6 2 2 5 3 5 6v3',
    radio:'m7 8 1-6m-3 7h11l1 12H5zm3 4h5m-5 4h3m8-13c2 2 3 5 2 8m-5-6c1 1 2 3 2 5',
    command:'M3 19v-5a9 9 0 0 1 18 0v4M4 13h3v7H4zm13 0h3v7h-3zm1 7c0 2-3 2-6 2',
    operations:'M2 6l6-3 8 3 6-3v15l-6 3-8-3-6 3zm6-3v15m8-12v15M5 13l5-4 4 4 5-5',
    facilities:'M2 21h20M4 21V9l6 3V8l6 4 1-10h3l1 19M7 16h1m3 0h1m4 0h1',
    loadout:'M3 15v-2a9 9 0 0 1 18 0v2l-4 2H7zm1-2h16M9 5l1 7m5-7-1 7m-7 5 2 4h6l2-4',
    ranking:'M7 3h10v5a5 5 0 0 1-10 0zm0 2H3v2c0 3 2 5 5 5m9-7h4v2c0 3-2 5-5 5m-4 1v5m-5 3h10m-8 0 1-3h4l1 3',
    report:'M6 3h9l4 4v14H6zm8 0v5h5M9 12h7m-7 4h7',
    chat:'M3 4h18v13H9l-6 4zm5 6h1m3 0h1m3 0h1',
    arrow:'M4 12h15m-6-6 6 6-6 6', next:'m9 5 7 7-7 7',
    pause:'M8 5v14m8-14v14', play:'m7 4 12 8-12 8z', map:'m2 6 6-3 8 3 6-3v15l-6 3-8-3-6 3zm6-3v15m8-12v15'
  };
  function icon(key){return '<svg class="fl-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+shapes[key]+'"/></svg>';}
  function artIcon(key){return '<i class="fl-art-icon fl-art-'+key+'" aria-hidden="true"></i>';}
  function factionArtHtml(side){return side==='A'||side==='B'?artIcon(side==='A'?'eagle':'wolf'):'';}
  function heat(state){
    const data=state.frontlineActivity;
    if(state.round?.status!=='ACTIVE'||state.truce?.active||!Array.isArray(data?.nodes))return [];
    return data.nodes.filter(n=>Number(n.attacks)>=Number(data.minimum||4)).sort((a,b)=>b.attacks-a.attacks);
  }
  function accessFor(state,n){
    if(state.round?.status!=='ACTIVE')return {kind:'wait',mark:'–',label:'교전 종료',why:'정산된 전장을 둘러볼 수 있습니다.'};
    if(!state.mine?.side)return {kind:'wait',mark:'–',label:'관전',why:'참가한 전투단이 진입할 수 있습니다.'};
    if(state.truce?.active)return {kind:'wait',mark:'–',label:'휴전',why:'휴전이 끝나면 교전할 수 있습니다.'};
    if(!n.canEnter)return {kind:'wait',mark:'–',label:'경로 대기',why:n.owner===state.mine.side?'현재 교전이 가능한 방어선 밖입니다.':'본진과 이어진 인접 거점을 먼저 확보하세요.'};
    return n.owner===state.mine.side?{kind:'defend',mark:'◇',label:'방어 지원',why:'상대가 접근할 수 있는 아군 거점입니다.'}:{kind:'advance',mark:'▸',label:'진입 가능',why:'아군 전선과 연결된 진격로가 열려 있습니다.'};
  }
  function mapHtml(state,{esc,sideName,selectedIndex,stage,actions}){
    const network=state.network,mine=state.mine?.side,current=Number(state.round?.current_front_index??4);
    const nodes=network?.nodes||(state.nodes||[]).map((n,i)=>({...n,index:n.index??i,owner:i<current?'A':i>current?'B':'',canEnter:i===current}));
    const edges=network?.edges||nodes.slice(1).map((n,i)=>[i,i+1]),hot=heat(state);
    const pos=i=>(network?coords:legacyCoords)[i]||[50,50];
    const sideCode=s=>s==='A'?'a':s==='B'?'b':'neutral';
    const lines=edges.map(([n,m])=>{const [x,y]=pos(n),[xx,yy]=pos(m),o=nodes.find(v=>v.index===n)?.owner;
      return `<line class="fl-route fl-route-${o&&o===nodes.find(v=>v.index===m)?.owner?sideCode(o):'neutral'}" x1="${x}%" y1="${y}%" x2="${xx}%" y2="${yy}%"/>`;}).join('');
    const marks=nodes.map(n=>{
      const [x,y]=pos(n.index),h=hot.find(v=>v.nodeIndex===n.index),site=siteFor(n,n.index),selected=n.index===Number(selectedIndex);
      const owner=n.owner?sideName(n.owner)+' 점령':'중립',name=esc(n.name),access=accessFor(state,n);
      const rank=hot.indexOf(h),scale=y<35 ? .86 : y>65 ? 1.08 : 1;
      const effects=h&&rank<2?'<span class="fl-impact'+(rank===0?' fl-main-impact':'')+'" aria-hidden="true"><i class="fl-tracer"></i><i class="fl-burst"></i><i class="fl-smoke"></i></span>':'';
      return `<button type="button" class="fl-node fl-${access.kind} fl-site-${site.key} fl-node-${sideCode(n.owner)} ${selected?'is-selected':''} ${h?'fl-node-hot':''}" style="left:${x}%;top:${y}%;--site-scale:${scale};--shot-delay:-${rank===1?3:0}s" data-tw4-node="${n.index}" aria-pressed="${selected}" aria-label="${name} · ${site.name} · ${esc(owner)} · ${access.label}${h?' · 교전중':''}">
        <span class="fl-base-ground" aria-hidden="true"></span><picture class="fl-site-model"><source media="(max-width:820px)" srcset="${art}site-${site.key}-160.webp"><img src="${art}site-${site.key}-320.webp" width="96" height="96" alt="" decoding="async"></picture>${effects}
        <span class="fl-node-label">${icon(access.kind)}${name}</span>${h?'<span class="fl-heat-label">'+artIcon('contact')+'교전중</span>':''}</button>`;
    }).join('');
    return `<section class="tw4-map-shell tw7-map fl-map" aria-label="영토전 전선 지도">${stage}
      <div class="fl-map-projection"><div class="fl-terrain"><picture class="tw4-map-art fl-map-photo"><source media="(max-width:820px)" srcset="${maps}terrain-mobile.webp"><img src="${maps}terrain-wide.webp" alt="" fetchpriority="high" decoding="async"></picture>
      <div class="fl-map-grid" aria-hidden="true"></div><svg class="fl-links" aria-hidden="true">${lines}</svg><div class="fl-map-pins" role="group" aria-label="전선 거점">${marks}</div></div></div>
      ${actions}</section>`;
  }
  function occupationHtml(state,{esc,sideName}){
    const counts=state.network?.counts,values=counts||state.counts||{};
    const team=side=>`<span class="fl-team fl-team-${side}">${factionArtHtml(side)}<span class="fl-team-copy"><strong>${esc(sideName(side))}</strong>${state.mine?.side===side?'<small>내 진영</small>':''}</span><b>${Number(values[side])||0}<small>${counts?'거점':'명'}</small></b></span>`;
    return `<div class="fl-control" aria-label="진영별 점령 현황">${team('A')}<span class="fl-meter"><span class="fl-meter-caption">${counts?'거점 점유':'참가 전력'}</span><span class="fl-control-bar" aria-hidden="true"><i style="flex:${Number(values.A)||0}"></i><i style="flex:${Number(counts?.neutral)||0}"></i><i style="flex:${Number(values.B)||0}"></i></span></span>${team('B')}</div>`;
  }
  function hotList(state,{esc}){
    const wars=heat(state),nodes=state.network?.nodes||state.nodes||[];
    if(!wars.length)return '';
    return `<nav class="fl-signal" aria-label="교전 거점 바로가기"><div>${artIcon('contact')}<h2>교전 지역</h2></div>
      ${wars.map(w=>{const n=nodes.find(p=>p.index===w.nodeIndex);return n?`<button type="button" data-tw4-node="${n.index}">${esc(n.name)} ${icon('arrow')}</button>`:'';}).join('')}</nav>`;
  }
  function legend(){
    return [['advance','진입'],['defend','방어'],['wait','대기']].map(([key,label])=>'<span>'+icon(key)+label+'</span>').join('');
  }

  // The radio reads the same public round snapshot as the map. A completed
  // personal engagement and a won sector are different reports.
  function radioReports(state,sideName){
    const nodes=state.network?.nodes||state.nodes||[],validSide=side=>side==='A'||side==='B';
    const report=(key,place,body)=>({key,place,body});
    if(state.round?.status==='FINISHED'){
      const winner=state.round.winner_side;
      return [report('finished','작전 종료',validSide(winner)?sideName(winner)+' 승리. 이번 회차의 전투가 종료됐습니다.':'이번 회차의 전투가 종료됐습니다.')];
    }
    if(state.truce?.active)return [report('truce','전 전선','휴전 발효. 양 진영의 교전이 일시 중지됐습니다.')];
    if(state.round?.status!=='ACTIVE')return [report('standby','개전 대기','양 진영의 전투 준비 상황을 기다립니다.')];
    const rows=[],now=Date.parse(state.serverNow)||Date.now();
    const fresh=value=>{
      if(!value)return false;
      const raw=String(value);
      const stamp=Date.parse(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(raw)?raw.replace(' ','T')+'Z':raw);
      return stamp<=now&&stamp>=now-120000;
    };
    const nodeAt=index=>index==null?null:nodes.find(n=>Number(n.index)===Number(index));
    const notice=state.notice;
    if(state.network&&notice?.type==='NETWORK_CAPTURE'&&fresh(notice.created_at)){
      const payload=notice.payload||{},node=nodeAt(payload.nodeIndex);
      const key='sector:'+(payload.frontId||'notice-'+notice.id);
      const team=validSide(notice.side)?sideName(notice.side)+' 측이 ':'';
      if(node&&typeof payload.defended==='boolean'){
        rows.push(report(key,node.name,team+(payload.defended?'거점 방어에 성공했습니다.':'거점을 점령했습니다. 진입 가능한 경로가 변경되었습니다.')));
      }else{
        rows.push(report(key,notice.title||'거점 소식',notice.message||'거점 상황이 변경되었습니다.'));
      }
    }
    for(const row of state.recentResults||[]){
      const node=nodeAt(row.node_index);
      if(node&&validSide(row.winner_side)&&fresh(row.created_at)){
        const key='sector:'+row.front_id;
        if(!rows.some(item=>item.key===key))rows.push(report(key,node.name,sideName(row.winner_side)+' 측이 거점 공방에서 승리했습니다.'));
        break;
      }
    }
    for(const contact of heat(state)){
      const node=nodeAt(contact.nodeIndex);
      if(node)rows.push(report('contact:'+node.index,node.name,
        rows.some(row=>row.key.startsWith('contact:'))?'이곳에서도 양측 교전이 이어지고 있습니다.':'양측 교전이 집중되고 있습니다.'));
    }
    const actions=state.recentActionPulse??state.recentActions??[];
    for(const row of actions){
      if(!row.front_id||!validSide(row.winner_side)||!fresh(row.created_at))continue;
      const result=(state.recentResults||[]).find(r=>String(r.front_id)===String(row.front_id));
      const node=nodes.find(n=>String(n.front_id)===String(row.front_id))||nodeAt(result?.node_index)||
        (String(state.front?.id)===String(row.front_id)?nodeAt(state.front.node_index):null);
      if(node){rows.push(report('action:'+row.id,node.name,sideName(row.winner_side)+' 측이 이곳에서 개인 교전 1승을 기록했습니다.'));break;}
    }
    if(!rows.length)rows.push(report('quiet','전선 관측','최근 2분간 집중 교전 보고가 없습니다.'));
    const counts=state.network?.counts;
    if(counts){
      const a=Number(counts.A)||0,b=Number(counts.B)||0;
      rows.push(report('control','점령 현황',a===b?'양 진영이 각각 '+a+'개 거점을 확보했습니다.':sideName(a>b?'A':'B')+' 측이 '+Math.max(a,b)+' 대 '+Math.min(a,b)+' 거점으로 앞서고 있습니다.'));
    }
    return rows;
  }

  let reports=[],cursor=0,roundId=null,manualPause=false,lastTurn=0,radio=null,tiltFrame=0;
  const motionPreference=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced=()=>Boolean(motionPreference?.matches);
  function radioHtml(state,{esc,sideName}){
    const next=radioReports(state,sideName),previous=reports[cursor]?.key;
    const changed=roundId!==state.round?.id;
    if(changed){roundId=state.round?.id;manualPause=false;}
    const latestSector=next[0].key.startsWith('sector:')&&next[0].key!==reports[0]?.key;
    const index=changed||(latestSector&&!manualPause)?-1:next.findIndex(row=>row.key===previous);
    if(index<0){cursor=0;lastTurn=Date.now();}else cursor=index;
    reports=next;
    const row=reports[cursor];
    return `<section class="fl-radio" aria-label="전선 무전"><div class="fl-radio-ident">${icon('radio')}<b>전선 무전</b><span class="fl-wave" aria-hidden="true"></span></div><div class="fl-radio-copy"><strong>${esc(row.place)}</strong><span>${esc(row.body)}</span></div>${reports.length>1?'<div class="fl-radio-controls"><button type="button" data-fl-pause aria-label="무전 자동 전환 일시정지" aria-pressed="false">'+icon('pause')+'</button><button type="button" data-fl-next aria-label="다음 무전">'+icon('next')+'</button></div>':''}</section>`;
  }
  function updatePause(){
    const button=radio?.querySelector('[data-fl-pause]');
    if(!button)return;
    button.hidden=reduced();
    button.setAttribute('aria-pressed',String(manualPause));
    button.setAttribute('aria-label',manualPause?'무전 자동 전환 재개':'무전 자동 전환 일시정지');
    button.innerHTML=icon(manualPause?'play':'pause');
  }
  function nextReport(){
    if(!radio||reports.length<2)return;
    cursor=(cursor+1)%reports.length;lastTurn=Date.now();
    radio.querySelector('.fl-radio-copy strong').textContent=reports[cursor].place;
    radio.querySelector('.fl-radio-copy span').textContent=reports[cursor].body;
  }
  function tick(){
    if(!radio||reports.length<2||document.hidden||manualPause||reduced()||Date.now()-lastTurn<6500)return;
    if(!radio.getClientRects().length||document.body.matches('.territory-war-drawer-open')||document.querySelector('.tw6-personal-battle'))return;
    nextReport();
  }
  function bind(root){
    cancelAnimationFrame(tiltFrame);tiltFrame=0;
    radio=root.querySelector('.fl-radio');
    updatePause();
    radio?.querySelector('[data-fl-next]')?.addEventListener('click',nextReport);
    radio?.querySelector('[data-fl-pause]')?.addEventListener('click',()=>{manualPause=!manualPause;lastTurn=Date.now();updatePause();});
    const viewport=root.querySelector('.fl-map-projection'),terrain=viewport?.firstElementChild;
    if(!terrain||!matchMedia('(hover:hover) and (pointer:fine)').matches||reduced())return;
    let bounds,x=0,y=0;
    viewport.onpointerenter=()=>{bounds=viewport.getBoundingClientRect();};
    viewport.onpointermove=event=>{
      if(!bounds||viewport.parentElement.dataset.sceneFx!=='on'||reduced())return;
      x=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1));
      y=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
      if(!tiltFrame)tiltFrame=requestAnimationFrame(()=>{
        terrain.style.setProperty('--tilt-x',(-y*.95).toFixed(2)+'deg');
        terrain.style.setProperty('--tilt-y',(x*1.45).toFixed(2)+'deg');
        tiltFrame=0;
      });
    };
    viewport.onpointerleave=()=>{cancelAnimationFrame(tiltFrame);tiltFrame=0;terrain.style.removeProperty('--tilt-x');terrain.style.removeProperty('--tilt-y');};
  }
  function dispose(){cancelAnimationFrame(tiltFrame);tiltFrame=0;radio=null;reports=[];cursor=0;roundId=null;}
  globalThis.CNineTerritoryNetwork={mapHtml,occupationHtml,factionArtHtml,hotList,siteFor,accessFor,legend,icon,artIcon,radioHtml,radioReports,bind,tick,dispose,warmMapImages};
})();
