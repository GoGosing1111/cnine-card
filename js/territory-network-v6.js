(() => {
  'use strict';
  function mapHtml(state,{esc,fmt,sideName,selectedIndex,stage,actions}){
    const map=state.network,nodes=map.nodes,mine=state.mine?.side;
    const routes=map.edges.map(([a,b])=>{const from=nodes.find(n=>n.index===a),to=nodes.find(n=>n.index===b),owner=from.owner&&from.owner===to.owner?from.owner:'';
      return `<line class="tw7-route ${owner?'side-'+owner.toLowerCase():''}" x1="${from.x}%" y1="${from.y}%" x2="${to.x}%" y2="${to.y}%"/>`;}).join('');
    return `<section class="tw4-map-shell tw7-map" aria-label="세 갈래 영토전 지도">
      ${stage}
      <picture class="tw4-map-art" aria-hidden="true"><img src="/assets/ui/territory-war/territory-command-map-v1824.webp?v=1824" alt="" decoding="async"></picture>
      <div class="tw4-map-shade" aria-hidden="true"></div>
      <div class="tw4-map-toolbar tw7-map-toolbar"><div><span><i class="side-a"></i>${esc(sideName('A'))}</span><span><i class="side-b"></i>${esc(sideName('B'))}</span><span><i class="contested"></i>중립</span></div><b>세 갈래 전선</b></div>
      <div class="tw7-lane-labels" aria-hidden="true"><span>북부 고지</span><span>중앙 돌파</span><span>남부 보급로</span></div>
      <svg class="tw4-territory-layer tw7-routes" aria-hidden="true">${routes}</svg>
      <div class="tw4-map-nodes tw7-nodes" role="group" aria-label="점령 거점">
        ${nodes.map(node=>{const selected=node.index===Number(selectedIndex),own=node.owner===mine,access=node.canEnter,label=node.owner?sideName(node.owner)+' 점령':'중립 거점',hint=access?(own?'방어 지원':'공략 가능'):node.owner&&!node.connected?'고립됨':own?'아군 점령지':'경로 확보 필요';
          return `<button type="button" class="tw7-node ${node.owner?'side-'+node.owner.toLowerCase():'contested'} ${selected?'selected':''} ${access?'is-accessible':''} ${node.type==='HOME'?'is-home':''}" style="--x:${node.x}%;--y:${node.y}%" data-tw4-node="${node.index}" aria-label="${esc(node.name)} · ${esc(label)} · ${hint}" aria-pressed="${selected}"><span class="tw7-node-pin">${node.type==='HOME'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V8h4V4h3v4h2V4h3v4h4v12h-6v-5h-4v5Z"/></svg>':String(node.index+1).padStart(2,'0')}</span><b>${esc(node.name)}</b><small>${hint}</small>${node.front_id?`<span class="tw7-node-hp"><i class="side-a" style="--hp:${Math.max(0,Math.min(100,Number(node.a_hp)/Math.max(1,Number(node.a_max_hp))*100))}%"></i><i class="side-b" style="--hp:${Math.max(0,Math.min(100,Number(node.b_hp)/Math.max(1,Number(node.b_max_hp))*100))}%"></i></span>`:''}</button>`;}).join('')}
      </div>
      <div class="tw7-map-instruction"><b>${map.canEnter?'선택한 거점에서 교전할 수 있습니다':'연결된 거점을 선택하세요'}</b><span>본진과 연결된 점령지에서 진격 · 적 본진 점령 시 승리</span></div>
      ${actions}
    </section>`;
  }
  function occupationHtml(state,{esc,sideName}){
    const c=state.network.counts;
    return `<section class="tw7-occupation" aria-label="전체 영토 점령 현황"><div class="side-a"><span>${esc(sideName('A'))}</span><b>${c.A}<small>거점</small></b></div><div class="tw7-occupation-center"><strong>영토 점령전</strong><span>개인 균형 편성 · ${c.neutral?`중립 ${c.neutral}곳`:'전 거점 점령 중'}</span><div class="tw7-control-track"><i class="side-a" style="flex:${c.A}"></i>${c.neutral?`<i class="neutral" style="flex:${c.neutral}"></i>`:''}<i class="side-b" style="flex:${c.B}"></i></div></div><div class="side-b"><span>${esc(sideName('B'))}</span><b>${c.B}<small>거점</small></b></div></section>`;
  }
  globalThis.CNineTerritoryNetwork={mapHtml,occupationHtml};
})();
