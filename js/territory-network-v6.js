(() => {
  'use strict';
  const root='/assets/ui/territory-war/network-v2/';
  const art={A:root+'guardian-citadel.webp',B:root+'purifier-citadel.webp'};
  function factionArtHtml(side,className=''){
    return art[side]?`<img class="tw7-citadel ${className}" src="${art[side]}" alt="" aria-hidden="true" decoding="async" draggable="false">`:'';
  }
  function nodeVisual(node){
    const neutral='<img class="tw7-citadel" src="'+root+'crossroads-sanctuary.webp" alt="" aria-hidden="true" decoding="async" draggable="false">';
    return `<span class="tw7-node-figure" aria-hidden="true"><i class="tw7-node-ground"></i>${factionArtHtml(node.owner)||neutral}<em>${node.type==='HOME'?'본진':String(node.index+1).padStart(2,'0')}</em></span>`;
  }
  function mapHtml(state,{esc,sideName,selectedIndex,stage,actions}){
    const map=state.network,nodes=map.nodes,mine=state.mine?.side;
    const routes=map.edges.map(([a,b])=>{
      const from=nodes.find(n=>n.index===a),to=nodes.find(n=>n.index===b),owner=from.owner&&from.owner===to.owner?from.owner:'';
      return `<line class="tw7-route ${owner?'side-'+owner.toLowerCase():''}" x1="${from.x}%" y1="${from.y}%" x2="${to.x}%" y2="${to.y}%"/>`;
    }).join('');
    return `<section class="tw4-map-shell tw7-map" aria-label="세 갈래 영토전 지도">
      ${stage}
      <picture class="tw4-map-art" aria-hidden="true"><img src="${root}three-fronts-map.webp" alt="" decoding="async" fetchpriority="high"></picture>
      <div class="tw4-map-shade" aria-hidden="true"></div>
      <div class="tw4-map-toolbar tw7-map-toolbar"><div><span><i class="side-a"></i>${esc(sideName('A'))}</span><span><i class="side-b"></i>${esc(sideName('B'))}</span><span><i class="contested"></i>중립</span></div><b>THREE FRONTS <span>세 갈래 전선</span></b></div>
      <div class="tw7-lane-labels" aria-hidden="true"><span><small>NORTHERN RIDGE</small>북부 고지</span><span><small>CENTRAL CROSSING</small>중앙 교차로</span><span><small>SOUTHERN RIVER</small>남부 보급로</span></div>
      <svg class="tw4-territory-layer tw7-routes" aria-hidden="true">${routes}</svg>
      <div class="tw4-map-nodes tw7-nodes" role="group" aria-label="점령 거점">
        ${nodes.map(node=>{
          const selected=node.index===Number(selectedIndex),own=node.owner===mine,access=node.canEnter,label=node.owner?sideName(node.owner)+' 점령':'중립 거점',hint=access?(own?'방어 지원':'공략 가능'):node.owner&&!node.connected?'고립됨':own?'아군 점령지':'경로 확보 필요';
          return `<button type="button" class="tw7-node ${node.owner?'side-'+node.owner.toLowerCase():'contested'} ${selected?'selected':''} ${access?'is-accessible':''} ${node.type==='HOME'?'is-home':''}" style="--x:${node.x}%;--y:${node.y}%" data-tw4-node="${node.index}" aria-label="${esc(node.name)} · ${esc(label)} · ${hint}" aria-pressed="${selected}">
            ${nodeVisual(node)}<span class="tw7-node-caption"><b>${esc(node.name)}</b><small>${hint}</small></span>
            ${node.front_id?`<span class="tw7-node-hp"><i class="side-a" style="--hp:${Math.max(0,Math.min(100,Number(node.a_hp)/Math.max(1,Number(node.a_max_hp))*100))}%"></i><i class="side-b" style="--hp:${Math.max(0,Math.min(100,Number(node.b_hp)/Math.max(1,Number(node.b_max_hp))*100))}%"></i></span>`:''}
          </button>`;
        }).join('')}
      </div>
      <div class="tw7-map-instruction"><b>${map.canEnter?'선택한 거점에서 교전할 수 있습니다':'연결된 거점을 선택하세요'}</b><span>연결된 점령지를 따라 진격 · 적 본진 점령 시 승리</span></div>
      ${actions}
    </section>`;
  }
  function occupationHtml(state,{esc,sideName}){
    const c=state.network.counts,mine=state.mine?.side;
    const banner=side=>`<button type="button" class="tw7-faction side-${side.toLowerCase()} ${mine===side?'is-mine':''}" data-tw4-node="${side==='A'?0:8}" aria-label="${esc(sideName(side))} 본진 확인">
      ${factionArtHtml(side)}<span class="tw7-faction-name"><small>${side==='A'?'WESTERN GUARD':'EASTERN FLAME'}</small><strong>${esc(sideName(side))}</strong><span>${mine===side?'내 진영 · ':''}${Number(state.counts?.[side]||0)}명</span></span><span class="tw7-faction-count"><b>${c[side]}</b><small>점령 거점</small></span>
    </button>`;
    return `<section class="tw7-occupation" aria-label="전체 영토 점령 현황">${banner('A')}
      <div class="tw7-occupation-center"><small>TERRITORY WAR</small><strong>영토 점령전</strong><span>개인 균형 편성 · ${c.neutral?`중립 ${c.neutral}곳`:'전 거점 점령 중'}</span><div class="tw7-control-track"><i class="side-a" style="flex:${c.A}"></i>${c.neutral?`<i class="neutral" style="flex:${c.neutral}"></i>`:''}<i class="side-b" style="flex:${c.B}"></i></div></div>
      ${banner('B')}</section>`;
  }
  globalThis.CNineTerritoryNetwork={mapHtml,occupationHtml,factionArtHtml};
})();
