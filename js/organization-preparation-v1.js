(function(global){
  function banner(d){
    if(!d.organizationPreparation)return'';
    return `<aside class="org-transition-banner"><span><small>THE FINAL CHAPTER</small><b>이번 챔피언스리그를 끝으로 클랜 운영 종료</b><em>15개 조직의 입단 접수와 새로운 세력도를 확인하세요.</em></span><button type="button" data-clan-tab="organization">조직 본부 열기 ↗</button></aside>`;
  }
  function render(){
    return '<section class="org-live-shell" aria-label="조직 본부"><iframe class="org-live-frame" src="/organization/?embed=1&amp;v=20261015-organization-live-v2" title="조직 본부 및 아지트" height="1150"></iframe><noscript><a href="/organization/">조직 본부 열기</a></noscript></section>';
  }
  function bind(root){
    const frame=root?.querySelector('.org-live-frame');
    if(!frame)return;
    // One listener across ClanV1 re-renders; only the currently attached frame can resize.
    global.removeEventListener('message',resize);
    global.addEventListener('message',resize);
  }
  function resize(event){
    const frame=document.querySelector('#clanRoot .org-live-frame');
    if(!frame||event.origin!==global.location.origin||event.source!==frame.contentWindow||event.data?.type!=='organization:height')return;
    const height=event.data.height;
    if(Number.isFinite(height)&&height>=300&&height<=30000)frame.style.height=Math.ceil(height)+'px';
  }
  global.OrganizationPreparation={banner,render,bind};
})(window);
