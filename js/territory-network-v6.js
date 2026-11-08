(() => {
  'use strict';
  const art='/assets/ui/territory-war/frontline-20261108/';
  const coords=[[9,50],[27,20],[73,20],[29,50],[50,50],[71,50],[27,80],[73,80],[91,50]];
  const legacyCoords=[[9,25],[29,25],[50,25],[71,25],[71,50],[50,50],[29,50],[29,76],[59,76]];
  const sites={HOME:['hq','야전 지휘본부'],OUTPOST:['outpost','전방 막사'],MID:['depot','군수 보급창'],GATE:['gate','차량 검문소'],CENTER:['relay','철교 통제소']};
  const siteFor=(node,index)=>{const [key,name]=sites[node?.type]||sites[['HOME','OUTPOST','MID','GATE','CENTER','GATE','MID','OUTPOST','HOME'][index]]||sites.CENTER;return {key,name,scene:art+'site-'+key+'-scene.webp'};};
  const shape={hot:'M12 2c2 5-2 6 1 10 2-1 3-3 3-5 5 5 5 10 1 13-3 3-9 2-12-2-2-5 1-8 4-11 0 3 0 4 2 5-1-4 3-6 1-10z',arrow:'M4 12h15 M13 5l7 7-7 7'};
  function icon(key){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+shape[key]+'"/></svg>';}
  function factionArtHtml(side){return side==='A'||side==='B'?'<span class="fl-side-symbol fl-'+side+'" aria-hidden="true">'+side+'</span>':'';}
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
    const nodes=network?.nodes||state.nodes.map((n,i)=>({...n,owner:i<current?'A':i>current?'B':'',canEnter:i===current}));
    const edges=network?.edges||nodes.slice(1).map((n,i)=>[i,i+1]),hot=heat(state);
    const pos=i=>(network?coords:legacyCoords)[i]||[50,50];
    const sideCode=s=>s==='A'?'a':s==='B'?'b':'neutral';
    const lines=edges.map(([n,m])=>{const [x,y]=pos(n),[xx,yy]=pos(m),o=nodes.find(v=>v.index===n)?.owner;
      return `<line class="fl-route fl-route-${o&&o===nodes.find(v=>v.index===m)?.owner?sideCode(o):'neutral'}" x1="${x}%" y1="${y}%" x2="${xx}%" y2="${yy}%"/>`;}).join('');
    const marks=nodes.map(n=>{
      const [x,y]=pos(n.index),h=hot.find(v=>v.nodeIndex===n.index),site=siteFor(n,n.index),selected=n.index===Number(selectedIndex);
      const owner=n.owner?sideName(n.owner)+' 점령':'중립',name=esc(n.name),access=accessFor(state,n);
      return `<button type="button" class="fl-node fl-${access.kind} fl-site-${site.key} fl-node-${sideCode(n.owner)} ${selected?'is-selected':''} ${h?'fl-node-hot':''}" style="left:${x}%;top:${y}%" data-tw4-node="${n.index}" aria-pressed="${selected}" aria-label="${name} · ${site.name} · ${esc(owner)} · ${access.label}${h?' · 격전, 최근 2분 '+Number(h.attacks)+'회':''}">
        <span class="fl-base-ground" aria-hidden="true"></span><picture class="fl-site-model"><source media="(max-width:820px)" srcset="${art}site-${site.key}-160.webp"><img src="${art}site-${site.key}-320.webp" width="96" height="96" alt="" decoding="async"></picture>
        <span class="fl-node-label"><i aria-hidden="true"></i>${name}<em aria-hidden="true">${access.mark}</em></span>${h?'<span class="fl-heat-label">'+icon('hot')+'격전 '+Number(h.attacks)+'</span>':''}</button>`;
    }).join('');
    return `<section class="tw4-map-shell tw7-map fl-map" aria-label="영토전 전선 지도">${stage}
      <div class="fl-map-projection"><picture class="tw4-map-art fl-map-photo"><source media="(max-width:820px)" srcset="${art}map-960.webp"><img src="${art}map-1600.webp" alt="" fetchpriority="high" decoding="async"></picture>
      <div class="fl-map-grid" aria-hidden="true"></div><svg class="fl-links" aria-hidden="true">${lines}</svg><div class="fl-map-pins" role="group" aria-label="전선 거점">${marks}</div></div>
      ${actions}</section>`;
  }
  function occupationHtml(state,{esc,sideName}){
    const counts=state.network?.counts,values=counts||state.counts||{};
    const team=side=>`<span class="fl-team fl-team-${side}">${factionArtHtml(side)}<strong>${esc(sideName(side))}</strong><b>${Number(counts?counts[side]:state.counts?.[side])||0}<small>${counts?'거점':'명'}</small></b>${state.mine?.side===side?'<i>내 진영</i>':''}</span>`;
    return `<div class="fl-control" aria-label="진영별 점령 현황">${team('A')}<span class="fl-control-bar" aria-hidden="true"><i style="flex:${Number(values.A)||0}"></i><i style="flex:${Number(counts?.neutral)||0}"></i><i style="flex:${Number(values.B)||0}"></i></span>${team('B')}</div>`;
  }
  function hotList(state,{esc}){
    const wars=heat(state),nodes=state.network?.nodes||state.nodes||[];
    return `<section class="fl-signal" aria-label="격전지"><div>${icon('hot')}<h2>격전지</h2><small>최근 2분</small></div>
      ${wars.length?wars.map(w=>{const n=nodes.find(p=>p.index===w.nodeIndex);return n?`<button type="button" data-tw4-node="${n.index}">${esc(n.name)} <b>${Number(w.attacks)}회</b> ${icon('arrow')}</button>`:'';}).join(''):'<span class="fl-quiet">집중 교전 없음</span>'}</section>`;
  }
  globalThis.CNineTerritoryNetwork={mapHtml,occupationHtml,factionArtHtml,hotList,siteFor,accessFor};
})();
