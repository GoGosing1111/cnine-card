import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {originalRaidPresentation,varsenRaidLabel} from '../shared/monster-original-ip-presentation-v1.mjs';
const originalIp=originalRaidPresentation('MADARA');
const read=p=>readFileSync(p,'utf8');
function freeEntryHtml(html){return html.replaceAll('공대 생성 입장권','무료 공대 생성').replaceAll('공대 생성자만 1장 사용','공대장·참가자 모두 무료').replaceAll('입장권 확인','무료 입장').replace(/<dialog id="madara-entryDialog"[\s\S]*?<\/dialog>/,part=>part.replace(/<dl>[\s\S]*?<\/dl>/,'').replace('공대 생성에 입장권<br><em>1장</em>을 사용합니다','무료로 공대를 생성합니다').replace('입장권은 방이 생성될 때 한 번 차감됩니다. 생성 후 해산·퇴장·패배해도 반환되지 않습니다.','공대 생성과 참가에 입장권을 사용하지 않습니다.').replace('1장 사용 · 방 생성','무료로 방 생성').replace('TEST 무료 입장 여부와 사용 수량은 서버 설정을 따릅니다.','입장권 없이 플레이할 수 있습니다.'));}
function freeEntryClient(client){return client.replaceAll('||account.tickets<account.cost','').replace("$('ticketBalance').textContent=account?`${account.tickets}장`:'—';", "$('ticketBalance').textContent='무료';").replace("$('entryBefore').textContent=account.tickets+'장';$('entryAfter').textContent=(account.tickets-account.cost)+'장';",'');}
const dir='raid/madara';mkdirSync(dir,{recursive:true});
let html=read('preview/madara-raid-v1/index.html').match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
html=html.replace(/\bid="([^"]+)"/g,(_,id)=>`id="madara-${id}" data-madara-id="${id}"`)
 .replaceAll('src="assets/','src="/preview/madara-raid-v1/assets/').replaceAll('href="assets/','href="/preview/madara-raid-v1/assets/')
 .replace(/<a href="\.\/" class="mr-brand">[\s\S]*?<\/a>/,'<span class="mr-brand">리버스콜 <span>레이드 작전실</span></span>')
 .replace('개발 준비 · 비공개','운영 상태 확인 중').replace('검수용 입장권','공대 생성 입장권')
 .replace(/<option value="COMMAND">[\s\S]*?<\/option>/,'').replace('다른 브라우저 또는 시크릿 창에서 참가하세요.','각자의 계정으로 참가하세요.')
 .replace(/<p class="mr-review-note">[\s\S]*?<\/p>/,'<p class="mr-review-note" data-entry-policy>설정을 불러오는 중입니다.</p><p class="mr-review-note" data-reward-policy></p>')
 .replace('수치는 로컬 검수 초안입니다. 단독 지휘에서는 담당자를 직접 교대합니다. 공대 검수 중 퇴장은 해당 검수 전투를 종료합니다.','모집 중 공대장이 퇴장하면 다음 참가자에게 위임합니다. 전투 중 퇴장은 공대 전체 작전을 종료합니다. 기믹 제한 시간과 광폭화는 공대 생성 당시 설정을 따릅니다.')
 .replace('로컬 개발 검수 · 실계정 보상 없음','보상은 서버의 클리어 정산 결과를 따릅니다.')
 .replace('검수를 종료할까요?','공대를 나갈까요?').replace('반환되지 않는 검수 초안입니다.','반환되지 않습니다.')
 .replace('로컬 검수용 · 운영 입장 정책은 미확정','TEST 무료 입장 여부와 사용 수량은 서버 설정을 따릅니다.')
 .replace('id="madara-showcaseButton"','hidden id="madara-showcaseButton"');
html=varsenRaidLabel(html)
 .replace(/<img class="mr-spirit"[^>]*>/,'')
 .replaceAll('/preview/madara-raid-v1/assets/madara-battle-v1.png',originalIp.battleSprite)
 .replaceAll('/preview/madara-raid-v1/assets/madara-concept-poster-v1.png',originalIp.sourceArt)
 .replace('붉은 갑주의 '+originalIp.name,originalIp.name)
 .replace('콘셉트 포스터 보기','원화 보기');
html=html.replace(/<span class="mr-ticket-mark"[^>]*>忍<\/span>/,`<img class="mr-ticket-mark" src="${originalIp.battleSprite}" alt="">`);
html=freeEntryHtml(html);
writeFileSync(dir+'/fragment.html','<!-- Generated from the reviewed Madara UI by scripts/build-madara-live.mjs. -->\n<section id="madara-live-app">'+html+'</section>\n');
let css=read('preview/madara-raid-v1/madara.css')+'\n'+read('preview/madara-raid-v1/mechanics.css');
css=css.replaceAll(':root{','#madara-live-app{').replace('html:has(#madara-app){scroll-behavior:auto;overflow-x:clip}','').replaceAll('#madara-app','#madara-live-app');
for(const id of ids.sort((a,b)=>b.length-a.length))css=css.replace(new RegExp('#'+id+'(?![\\w-])','g'),'#madara-'+id);
css=css.replaceAll("url('assets/","url('/preview/madara-raid-v1/assets/").replaceAll('url("assets/','url("/preview/madara-raid-v1/assets/');
css=css.replaceAll('/preview/madara-raid-v1/assets/madara-battle-v1.png',originalIp.battleSprite);
css+='\n#madara-live-app img.mr-ticket-mark{width:58px;height:64px;object-fit:contain}\n';
css+='\n#madara-live-app{border-radius:20px;min-width:0}#madara-live-app .mr-top{position:relative}#madara-live-app .mr-staging{min-height:0}#madara-live-app .mr-development{white-space:normal}#madara-live-app [data-reward-policy]{color:var(--mr-cyan)}\n';
css+='\n'+read('raid/madara/combat-screen.css');
writeFileSync(dir+'/live.css',css);
let client=read('preview/madara-raid-v1/madara.js')
 .replaceAll('madara_review_','madara_live_').replaceAll('account.tickets<1','account.tickets<account.cost').replaceAll('(account.tickets-1)','(account.tickets-account.cost)')
 .replaceAll("$('showcaseButton').hidden=false","$('showcaseButton').hidden=true")
 .replace("const query=new URLSearchParams", "if(body&&!body.requestId)body.requestId=crypto.randomUUID();\n    const query=new URLSearchParams")
 .replace('code:result.code','code:result.code,retryable:result.retryable').replace('if(error.status)throw error;','if(error.status&&!error.retryable)throw error;')
 .replace("function updateWallet(){",`function updateWallet(){
    if(account){$('playerName').value=account.name;$('playerName').readOnly=true;document.querySelector('.mr-ticket div>span').textContent=account.cost?'공대 생성자만 '+account.cost+'장 사용':'현재 무료 입장 · 차감 없음';$('entryDialog').querySelector('h2').textContent=account.cost?'공대 생성에 입장권 '+account.cost+'장을 사용합니다':'입장권 차감 없이 공대를 생성합니다';$('confirmEntry').textContent=account.cost?account.cost+'장 사용 · 방 생성':'무료로 방 생성';document.querySelector('[data-entry-policy]').textContent=(account.cost?'공대 생성자만 '+account.cost+'장 소모 · 생성 후 반환 없음':'현재 무료 입장 · 입장권 차감 없음')+' · 참가자 무료';}
  `)
 .replace("$('resultDialog').showModal();",`const reward=state.clearReward;$('resultDialog').querySelector('.mr-muted').textContent=reward?.granted?('클리어 보상 · '+Number(reward.coin).toLocaleString()+' 코인 / 마별 '+reward.masterStars+' / 펫 정수 '+reward.petEssence):reward?.status==='WEEKLY_LIMIT'?'이번 주 보상 수령 한도에 도달했습니다.':'TEST 또는 보상 미설정 공대 · 보상 지급 없음';$('resultDialog').showModal();`)
 .replace("if(result.token){",`if(result.feature){document.querySelector('.mr-development').textContent=result.feature.mode+' · 마다라 레이드';}
    if(result.settings){const s=result.settings,w=result.weeklyReward;document.querySelector('[data-reward-policy]').textContent='광폭화 '+s.enrageSeconds+'초 · 기믹 제한 '+s.mechanicTimePercent+'% · '+(result.feature.mode==='TEST'?'TEST 보상 없음':s.rewardsEnabled?'클리어 '+Number(s.coinReward).toLocaleString()+' 코인 / 마별 '+s.masterStarReward+' / 펫 정수 '+s.petEssenceReward:'클리어 보상 지급 OFF')+(w?' · 주간 '+w.used+'/'+w.limit+'회':'');}
    if(result.token){`)
 .replace("'3~6명 · 세 역할 · 전원 준비가 필요합니다. 다른 브라우저 또는 시크릿 창에서 참가하세요. 출정 후 강퇴는 잠깁니다.'","'3~6명 · 세 역할 · 전원 준비가 필요합니다. 각자의 계정으로 참가하세요. 출정 후 강퇴는 잠깁니다.'");
client=client.replace("$('resultDialog').showModal();","$('resultDialog').showModal();\n      mountRewardRevealButton($('resultDialog'),reward?.choiceOffer,{signal:revealLifecycle.signal,auto:true});");
client=freeEntryClient(client);
const sources=varsenRaidLabel(['presentation.js','battle.js','mechanics-ui.js'].map(f=>read('preview/madara-raid-v1/'+f).replaceAll('`assets/animation/','`/preview/madara-raid-v1/assets/animation/')).concat(client).join('\n'));
const prelude=read('raid/madara/runtime-scope.mjs');
writeFileSync(dir+'/runtime.mjs',`import {mountRewardRevealButton,mountRewardRevealInbox} from '/js/content-reward-reveal-v1.mjs?v=20261016-reveal1';\n// Generated from reviewed presentation, battle, mechanics and client sources.\n${prelude}\nexport function mountMadara(root){\n const revealLifecycle=new AbortController();mountRewardRevealInbox(root,{signal:revealLifecycle.signal});\n const scope=createMadaraScope(root);const {window,document,fetch,setTimeout,clearTimeout,requestAnimationFrame}=scope;\n${sources}\n return {destroy(){revealLifecycle.abort();scope.destroy();}};\n}\n`);
console.log('Madara live fragment, scoped styles and runtime generated.');
