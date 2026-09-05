import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=relative=>readFileSync(path.join(root,relative),'utf8');
const moduleSource=read('js/card-unique-advancement-v1.js');
const css=read('css/card-unique-advancement-v1.css');
const app=read('js/app.js');
const index=read('index.html');
const preview=read('preview/card-unique-advancement-v1/index.html');
const previewScript=read('preview/card-unique-advancement-v1/preview.js');

function loadUi(){
  const context={};context.globalThis=context;context.window=context;
  vm.createContext(context);
  vm.runInContext(moduleSource,context,{filename:'card-unique-advancement-v1.js'});
  assert.ok(context.CNineCardUniqueAdvancementV1937,'V1937 UI 모듈이 전역에 설치되어야 합니다.');
  return context.CNineCardUniqueAdvancementV1937;
}

const baseOverview=overrides=>({
  cardId:'UI-CARD-1',
  current:null,
  grade:'ZENITH',
  breakthroughLevel:13,
  dominantType:'DEFENSE',
  classInfo:{code:'SERVER_CLASS_DEFENSE',name:'반격자',effect:'서버 효과 <강화>',tradeoff:'서버 대가 & 조건',fxKey:'server-defense-fx'},
  requirements:{eligibleGrades:['FUR','ZENITH','SUPERSTAR'],minBreakthrough:13,costMasterStars:3000,successChancePercent:10},
  wallet:{masterStars:3000},
  eligibility:{eligible:true,reasons:[]},
  canAdvance:true,
  ...overrides
});

test('UI 계약은 FUR/ZENITH/SUPERSTAR +13, 마스터의 별 3,000개, 성공률 10%로 고정된다',()=>{
  const ui=loadUi();
  assert.equal(ui.VERSION,'2043');
  assert.equal(ui.ENDPOINT,'card/unique-advancement');
  assert.equal(ui.FEATURE_ENDPOINT,'card/unique-advancement/feature');
  assert.deepEqual(Array.from(ui.ELIGIBLE_GRADES),['FUR','ZENITH','SUPERSTAR']);
  assert.equal(ui.MIN_BREAKTHROUGH,13);
  assert.equal(ui.MASTER_STAR_COST,3000);
  assert.equal(ui.SUCCESS_CHANCE_PERCENT,10);
  assert.deepEqual(Array.from(ui.TYPE_ORDER),['ATTACK','DEFENSE','SPEED','HP']);
  assert.deepEqual(Array.from(ui.TYPE_ORDER,type=>ui.TYPE_META[type].name),['파쇄자','반격자','잔영자','불멸자']);

  const card=grade=>({id:'C-1',grade});
  assert.equal(ui.getFeatureStatus().mode,'OFF');
  assert.equal(ui.shouldExpose({card:card('FUR'),owned:true,level:13}),false,'서버 동기화 전에는 조건 충족 카드도 숨깁니다.');

  ui.applyFeatureStatus({mode:'ON',enabledForUser:true,ready:true});
  assert.equal(ui.shouldExpose({card:card('FUR'),owned:true,level:13}),true,'클라이언트 uniqueAbility 없이 서버 상태로 노출합니다.');
  assert.equal(ui.shouldExpose({card:card('ZENITH'),owned:true,level:13}),true);
  assert.equal(ui.shouldExpose({card:card('ZENITH'),owned:true,level:12}),false);
  assert.equal(ui.shouldExpose({card:card('SUPERSTAR'),owned:true,level:13}),true);
  assert.equal(ui.shouldExpose({card:card('SUPERSTAR'),owned:true,level:12}),false);
  assert.equal(ui.shouldExpose({card:card('FUR'),owned:false,level:13}),false);

  ui.applyFeatureStatus({mode:'TEST',enabledForUser:false,testAccess:false,ready:true});
  assert.equal(ui.shouldExpose({card:card('FUR'),user:{role:'OWNER'},owned:true,level:13}),false,'TEST 권한도 서버 enabledForUser가 결정합니다.');
  ui.applyFeatureStatus({mode:'TEST',enabledForUser:true,testAccess:true,ready:true});
  assert.equal(ui.shouldExpose({card:card('FUR'),user:{role:'USER'},owned:true,level:13}),true);
  ui.applyFeatureStatus({mode:'OFF',enabledForUser:true,ready:true});
  assert.equal(ui.shouldExpose({card:card('FUR'),owned:true,level:13}),false);
});

test('feature 상태는 인증 API에서 동기화하고 실패·로그아웃·경합 시 OFF로 닫힌다',async()=>{
  const ui=loadUi(),requests=[];
  const live=await ui.syncFeatureStatus(async(endpoint,request,options)=>{
    requests.push({endpoint,request,options});
    return {ok:true,feature:{mode:'TEST',enabledForUser:true,testAccess:true,ready:true}};
  });
  assert.equal(requests[0].endpoint,'card/unique-advancement/feature');
  assert.equal(requests[0].options.ttl,0);
  assert.equal(live.mode,'TEST');
  assert.equal(live.enabledForUser,true);

  let release;
  const stale=ui.syncFeatureStatus(()=>new Promise(resolve=>{release=resolve}));
  ui.resetFeatureStatus();
  release({feature:{mode:'ON',enabledForUser:true,ready:true}});
  await stale;
  assert.equal(ui.getFeatureStatus().mode,'OFF','로그아웃 뒤 늦은 응답으로 다시 열리면 안 됩니다.');

  await ui.syncFeatureStatus(async()=>{throw new Error('network')});
  assert.equal(ui.getFeatureStatus().mode,'OFF');
  assert.equal(ui.getFeatureStatus().enabledForUser,false);
  assert.equal(ui.getFeatureStatus().ready,false);
});

test('4종을 모두 보여주되 서버 dominantType 한 종만 자동 추천한다',()=>{
  const ui=loadUi(),overview=ui.normalizeOverview(baseOverview());
  assert.equal(overview.canAdvance,true);
  assert.equal(overview.dominantType,'DEFENSE');
  assert.equal(overview.classInfo.code,'SERVER_CLASS_DEFENSE');
  const routes=Array.from(ui.routeModels(overview));
  assert.equal(routes.length,4);
  assert.deepEqual(routes.filter(route=>route.recommended).map(route=>route.type),['DEFENSE']);
  assert.equal(routes.find(route=>route.type==='DEFENSE').effect,'서버 효과 <강화>');
  assert.equal(routes.find(route=>route.type==='ATTACK').effect,'');

  const html=ui.renderOverview(overview);
  assert.equal((html.match(/class="ua-route /g)||[]).length,4);
  assert.equal((html.match(/data-recommended="true"/g)||[]).length,1);
  assert.match(html,/data-route-type="DEFENSE"[^>]*data-recommended="true"/);
  assert.doesNotMatch(html,/data-route-type="ATTACK"[^>]*data-recommended="true"/);
  assert.match(html,/서버 효과 &lt;강화&gt;/);
  assert.match(html,/서버 대가 &amp; 조건/);
  assert.doesNotMatch(html,/서버 효과 <강화>/);
});

test('라이브 서버의 card/recommendedClass/config 응답을 UI 계약으로 정규화한다',()=>{
  const ui=loadUi();
  const overview=ui.normalizeOverview({
    ok:true,
    feature:{mode:'ON',enabledForUser:true,ready:true},
    config:{allowedGrades:['FUR','ZENITH','SUPERSTAR'],minimumBreakthrough:13,costMasterStars:3000,successChancePercent:10},
    card:{id:'LIVE-FUR-13',title:'라이브 카드',grade:'FUR',breakthroughLevel:13,uniqueStats:{ATTACK:4,DEFENSE:5,SPEED:21,HP:7}},
    recommendedType:'SPEED',
    recommendedClass:{classCode:'SERVER_LIVE_SPEED',dominantType:'SPEED',name:'잔영자',subtitle:'서버 부제',description:'서버 설정에서 읽은 전직 효과'},
    masterStars:3400,
    uniqueAdvancement:null,
    eligibility:{eligible:true,code:'READY',reason:'',grade:'FUR',breakthroughLevel:13,dominant:{dominantType:'SPEED'}},
    canAdvance:true
  });
  assert.equal(overview.cardId,'LIVE-FUR-13');
  assert.equal(overview.grade,'FUR');
  assert.equal(overview.breakthroughLevel,13);
  assert.equal(overview.dominantType,'SPEED');
  assert.equal(overview.classInfo.code,'SERVER_LIVE_SPEED');
  assert.equal(overview.classInfo.effect,'서버 설정에서 읽은 전직 효과');
  assert.equal(overview.wallet.masterStars,3400);
  assert.equal(overview.canAdvance,true);
  assert.deepEqual(Array.from(ui.routeModels(overview)).filter(route=>route.recommended).map(route=>route.type),['SPEED']);

  const completed=ui.normalizeOverview({...overview.raw,uniqueAdvancement:{active:true,classCode:'SERVER_LIVE_SPEED',dominantType:'SPEED'},canAdvance:false,material:{balanceAfter:400},masterStars:undefined});
  assert.equal(completed.current.code,'SERVER_LIVE_SPEED');
  assert.equal(completed.wallet.masterStars,400);
  assert.equal(completed.canAdvance,false);
});

test('클라이언트는 서버 응답이 있어도 조건 우회·임의 코드를 활성화하지 않는다',()=>{
  const ui=loadUi();
  const rejected=[
    baseOverview({grade:'LIMITED'}),
    baseOverview({breakthroughLevel:12}),
    baseOverview({wallet:{masterStars:2999}}),
    baseOverview({dominantType:'UNKNOWN'}),
    baseOverview({classInfo:{name:'반격자',effect:'x',tradeoff:'y'}}),
    baseOverview({eligibility:{eligible:false,reasons:['서버 차단']}}),
    baseOverview({requirements:{eligibleGrades:['FUR','ZENITH','SUPERSTAR'],minBreakthrough:12,costMasterStars:3000}}),
    baseOverview({requirements:{eligibleGrades:['FUR','ZENITH','SUPERSTAR'],minBreakthrough:13,costMasterStars:1}}),
    baseOverview({requirements:{eligibleGrades:['FUR','ZENITH','SUPERSTAR'],minBreakthrough:13,costMasterStars:3000,successChancePercent:11}})
  ];
  for(const raw of rejected)assert.equal(ui.normalizeOverview(raw).canAdvance,false,JSON.stringify(raw));

  const complete=ui.normalizeOverview(baseOverview({current:{code:'SERVER_CLASS_DEFENSE',type:'DEFENSE',status:'COMPLETED'},canAdvance:true}));
  assert.equal(complete.canAdvance,false);
  assert.match(ui.renderOverview(complete),/전직 완료/);
});

test('완료 카드는 최신 추천이 아니라 저장된 전직 한 종만 강조하고 설명한다',()=>{
  const ui=loadUi(),completed=ui.normalizeOverview(baseOverview({
    wallet:{masterStars:400},
    dominantType:'ATTACK',
    classInfo:{code:'LATEST_ATTACK',dominantType:'ATTACK',name:'최신 공격 추천',effect:'LATEST ATTACK EFFECT'},
    recommendedClass:{classCode:'LATEST_ATTACK',dominantType:'ATTACK',name:'최신 공격 추천',description:'LATEST ATTACK EFFECT'},
    config:{classes:[
      {classCode:'LATEST_ATTACK',dominantType:'ATTACK',name:'최신 공격 추천',description:'LATEST ATTACK EFFECT'},
      {classCode:'SAVED_HP',dominantType:'HP',name:'저장된 생명 전직',description:'SAVED HP EFFECT',tradeoff:'SAVED HP COST'}
    ]},
    current:{active:true,classCode:'SAVED_HP',dominantType:'HP',status:'COMPLETED'},
    canAdvance:false
  }));
  assert.equal(completed.dominantType,'HP');
  assert.equal(completed.classInfo.code,'SAVED_HP');
  assert.equal(completed.classInfo.name,'저장된 생명 전직');
  const routes=Array.from(ui.routeModels(completed));
  assert.deepEqual(routes.filter(route=>route.completed).map(route=>route.type),['HP']);
  assert.equal(routes.filter(route=>route.recommended).length,0);

  const html=ui.renderOverview(completed);
  assert.equal((html.match(/data-completed="true"/g)||[]).length,1);
  assert.equal((html.match(/aria-current="true"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-recommended="true"/);
  assert.match(html,/저장된 서버 전직 기록이 적용 중입니다/);
  assert.match(html,/SAVED HP EFFECT/);
  assert.doesNotMatch(html,/마스터의 별 [\d,]+개가 더 필요합니다/);
  assert.match(html,/SAVED HP COST/);
  assert.doesNotMatch(html,/LATEST ATTACK EFFECT/);
});

test('효과 수치·단계·숙련도는 임의 생성하지 않고 서버 classInfo 문구만 사용한다',()=>{
  assert.doesNotMatch(moduleSource,/\b(?:SHATTER|RIPOSTE|AFTERIMAGE|IMMORTAL)\b/,'미확정 영문 class code를 UI에 고정하면 안 됩니다.');
  assert.doesNotMatch(moduleSource,/remainingActivations|masteryPercent|proficiency|triggerCondition/,'서버 계약에 없는 상태를 가짜로 표시하면 안 됩니다.');
  const ui=loadUi(),withoutCopy=ui.normalizeOverview(baseOverview({classInfo:{code:'SERVER_ONLY',name:'파쇄자'}}));
  const html=ui.renderOverview(withoutCopy);
  assert.match(html,/효과와 대가 설명은 서버 설정이 등록되면 표시됩니다/);
  assert.doesNotMatch(html,/(치명타|관통|반격 확률|회피율|최대 체력)\s*[+\-]?\d/);
});

test('전직 확인은 카드 상세 패널 내부에서 처리되고 별도 모달을 만들지 않는다',()=>{
  const ui=loadUi(),card={id:'UI-CARD-1',grade:'ZENITH',uniqueAbility:{attackPercent:20}};
  const panel=ui.panelHtml({card,user:{masterStars:3000},level:13,active:true});
  assert.match(panel,/data-profile-panel="advancement"/);
  assert.match(panel,/data-unique-advancement-root/);
  assert.match(panel,/cpv2-panel ua-panel is-active/);
  assert.doesNotMatch(moduleSource,/role=["']dialog|aria-modal|document\.getElementById\(["']modal/);

  const confirm=ui.renderOverview(ui.normalizeOverview(baseOverview()),{confirming:true});
  assert.match(confirm,/data-ua-cancel/);
  assert.match(confirm,/data-ua-submit/);
  assert.match(confirm,/FINAL SERVER CONFIRMATION \/ 10%/);
  assert.match(confirm,/성공 여부와 관계없이 마스터의 별 3,000개가 소모/);
  assert.doesNotMatch(confirm,/role="dialog"|aria-modal/);
});

test('통신 모호성은 같은 requestId로 재시도하고 명시적 실패는 완료로 오인하지 않는다',async()=>{
  const ui=loadUi(),postBodies=[],savedUsers=[];
  const localUser={masterStars:3000};
  const rootElement={
    dataset:{cardId:'UI-CARD-1'},
    innerHTML:'',
    isConnected:true,
    addEventListener(type,listener){if(type==='click')this.clickListener=listener}
  };
  const tab={addEventListener(){},getAttribute(){return 'false'}};
  const modal={querySelector(selector){
    if(selector==='[data-unique-advancement-root]')return rootElement;
    if(selector==='[data-profile-tab="advancement"]')return tab;
    return null;
  }};
  const apiRequest=async(endpoint,request={})=>{
    if(request.method==='POST'){
      const body=JSON.parse(request.body);postBodies.push(body);
      if(postBodies.length===1)throw new Error('response lost');
      return {ok:true,success:false,outcome:'FAILED',cardId:'UI-CARD-1',grade:'ZENITH',breakthroughLevel:13,recommendedType:'DEFENSE',recommendedClass:{classCode:'SERVER_CLASS_DEFENSE',dominantType:'DEFENSE',name:'반격자'},uniqueAdvancement:null,material:{balanceAfter:0},config:{allowedGrades:['FUR','ZENITH','SUPERSTAR'],minimumBreakthrough:13,costMasterStars:3000,successChancePercent:10}};
    }
    assert.match(endpoint,/card\/unique-advancement\?cardId=UI-CARD-1/);
    return baseOverview();
  };
  const controller=ui.bind(modal,{card:{id:'UI-CARD-1',grade:'ZENITH'},level:13,apiRequest,loadUser:()=>localUser,saveUser:user=>savedUsers.push({...user}),clearApiCache(){}});
  await controller.load();
  const dispatch=attribute=>rootElement.clickListener({
    target:{closest(){return {hasAttribute:name=>name===attribute}}},
    preventDefault(){},
    stopPropagation(){}
  });
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await Promise.resolve()};

  dispatch('data-ua-advance');
  assert.match(rootElement.innerHTML,/MASTER STAR 3,000 · SUCCESS 10%|FINAL SERVER CONFIRMATION \/ 10%/);
  dispatch('data-ua-submit');
  await flush();
  assert.equal(postBodies.length,1);
  assert.match(rootElement.innerHTML,/response lost/);
  assert.match(rootElement.innerHTML,/data-ua-submit/,'결과가 모호하면 동일 요청을 다시 보낼 수 있어야 합니다.');

  dispatch('data-ua-submit');
  await flush();
  assert.equal(postBodies.length,2);
  assert.ok(postBodies[0].requestId);
  assert.equal(postBodies[1].requestId,postBodies[0].requestId,'네트워크 오류 재시도는 동일 requestId를 유지해야 합니다.');
  assert.match(rootElement.innerHTML,/전직 실패 · 재료 3,000개 소모/);
  assert.match(rootElement.innerHTML,/최신 전직 상태 다시 확인/);
  assert.doesNotMatch(rootElement.innerHTML,/고유효과 전직이 완료되었습니다|data-completed="true"|is-completed/);
  assert.equal(savedUsers.at(-1).masterStars,0);
});

test('PC 2x2·모바일 1열과 3탭 반응형 계약이 적용된다',()=>{
  assert.match(css,/\.ua-route-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  const mobile=css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/)?.[1]||'';
  assert.match(mobile,/\.ua-route-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css,/\.cpv2-tabs\.has-advancement\s*\{\s*grid-template-columns:\s*repeat\(3/);
  assert.match(css,/\.ua-primary,[\s\S]*?min-height:\s*48px/);
});

test('app 최소 훅과 index 리소스 순서가 카드 렌더러를 변경하지 않고 연결된다',()=>{
  const modulePosition=index.indexOf('js/card-unique-advancement-v1.js');
  const appPosition=index.indexOf('js/app.js');
  const profileCssPosition=index.indexOf('css/card-profile-v2.css');
  const advancementCssPosition=index.indexOf('css/card-unique-advancement-v1.css');
  assert.ok(modulePosition>=0&&modulePosition<appPosition,'전직 모듈은 app.js보다 먼저 로드되어야 합니다.');
  assert.ok(profileCssPosition>=0&&profileCssPosition<advancementCssPosition,'전직 CSS는 카드 상세 CSS 뒤에서 확장해야 합니다.');
  assert.match(index,/js\/card-unique-advancement-v1\.js\?v=2043-advancement-pass/);
  assert.match(index,/css\/card-unique-advancement-v1\.css\?v=1939-advancement-awakening/);
  assert.match(app,/CNineCardUniqueAdvancementV1937/);
  assert.match(app,/data-profile-tab="advancement"/);
  assert.match(app,/advancementUi\.bind\(modal,/);
  assert.match(app,/advancementUi\.syncFeatureStatus\(apiRequest\)/);
  assert.match(app,/resetUniqueAdvancementFeatureState\(\)/);
  assert.ok((app.match(/await syncUniqueAdvancementFeatureState\(\)/g)||[]).length>=3,'startup/register/login 모두 feature 상태를 동기화해야 합니다.');

  const cardRenderer=app.slice(app.indexOf('function cardHtml('),app.indexOf('function showDetail('));
  assert.doesNotMatch(cardRenderer,/advancement|전직|CNineCardUniqueAdvancement/,'cardHtml 원본 렌더러에 전직 구현을 섞으면 안 됩니다.');
});

test('GET/POST는 단일 서버 API 계약과 요청 멱등 키를 사용한다',()=>{
  assert.match(moduleSource,/ENDPOINT='card\/unique-advancement'/);
  assert.match(moduleSource,/FEATURE_ENDPOINT=`\$\{ENDPOINT\}\/feature`/);
  assert.match(moduleSource,/apiRequest\(FEATURE_ENDPOINT,\{\}, \{ttl:0/);
  assert.match(moduleSource,/api\(`\$\{ENDPOINT\}\?cardId=\$\{encodeURIComponent\(cardId\)\}`/);
  assert.match(moduleSource,/method:'POST',body:JSON\.stringify\(\{cardId,requestId:state\.operationRequestId,expectedPassUse:state\.operationPassUse\}\)/);
  assert.doesNotMatch(moduleSource,/JSON\.stringify\(\{cardId,requestId:state\.operationRequestId,expectedClassCode/);
  assert.match(moduleSource,/serverReclassified=returnedCurrent\.code!==expectedClassCode\|\|normalizedType\(returnedCurrent\.type\)!==expectedType/);
  assert.match(moduleSource,/서버 최신 고유효과 판정으로 전직이 완료되었습니다/);
  assert.match(moduleSource,/result\?\.success===false\|\|returned\?\.success===false\|\|outcome==='FAILED'/);
  assert.match(moduleSource,/전직 실패 · 재료 \$\{formatNumber\(MASTER_STAR_COST\)\}개 소모/);
  assert.match(moduleSource,/ttl:0/);
});

test('독립 프리뷰는 네 상태를 API 호출 없이 서버 fixture로 검수한다',()=>{
  assert.match(preview,/card-unique-advancement-v1\.css/);
  assert.match(preview,/card-unique-advancement-v1\.js/);
  assert.equal((preview.match(/data-preview-state=/g)||[]).length,4);
  assert.match(previewScript,/mountPreview/);
  assert.match(previewScript,/eligibleGrades:\['FUR','ZENITH','SUPERSTAR'\]/);
  assert.doesNotMatch(previewScript,/apiRequest|fetch\s*\(|\/api\//);
});

test('라이브 엔트리는 서버 feature 동기화 전 OFF로 닫고 클라이언트 uniqueAbility에 의존하지 않는다',()=>{
  assert.doesNotMatch(index,/data-unique-advancement-mode=/);
  assert.match(moduleSource,/CLOSED_FEATURE_STATUS=Object\.freeze\(\{mode:'OFF',enabledForUser:false,testAccess:false,ready:false\}\)/);
  assert.match(app,/shouldExpose\?\.\(\{card,owned,level,grade:normalizedGrade\}\)/);
  assert.doesNotMatch(moduleSource,/shouldExpose[\s\S]{0,500}uniqueAbility/);
});

test('패스권 보유 시 확인 화면에 100%와 패스권 1개·마별 3,000개 소모를 명시한다',()=>{
  const ui=loadUi();
  const raw=baseOverview({advancementPass:{itemCode:'UNIQUE_ADVANCEMENT_PASS',quantity:2,spent:0},effectiveSuccessChancePercent:100});
  const overview=ui.normalizeOverview(raw);
  assert.equal(overview.canAdvance,true);assert.equal(overview.successChancePercent,100);
  assert.equal(overview.advancementPass.willConsume,true);
  const html=ui.renderOverview(overview,{confirming:true});
  assert.match(html,/전직 패스권 보유 2개/);
  assert.match(html,/FINAL SERVER CONFIRMATION \/ 100%/);
  assert.match(html,/전직 패스권 1개와 마스터의 별 3,000개가 소모되며 100% 성공/);
  assert.doesNotMatch(html,/실패해도|성공 확률은 10%/);
  assert.equal(ui.normalizeOverview({...raw,advancementPass:{quantity:0}}).canAdvance,false,'패스권 없이 서버의 100% 안내만 신뢰하지 않는다');
  assert.equal(ui.normalizeOverview({...raw,effectiveSuccessChancePercent:10}).canAdvance,false,'서버와 보유 상태가 다르면 차단한다');
  assert.equal(ui.normalizeOverview({...raw,wallet:{masterStars:2999}}).canAdvance,false);
});

test('100% 확인 후 패스권이 사라지면 10% 재시도 대신 최신 상태 확인을 요구한다',async()=>{
  const ui=loadUi(),bodies=[],cleared=[];
  let available=true,attempts=0;
  const rootElement={dataset:{cardId:'UI-CARD-1'},innerHTML:'',isConnected:true,addEventListener(type,listener){this.listener=listener}};
  const modal={querySelector(selector){return selector==='[data-unique-advancement-root]'?rootElement:null}};
  const controller=ui.bind(modal,{card:{id:'UI-CARD-1',grade:'ZENITH'},level:13,clearApiCache:key=>cleared.push(key),apiRequest:async(endpoint,request={})=>{
    if(request.method!=='POST')return baseOverview({advancementPass:{quantity:available?1:0},effectiveSuccessChancePercent:available?100:10});
    bodies.push(JSON.parse(request.body));attempts++;
    if(attempts===1)throw Object.assign(new Error('전직 패스권 보유 상태를 다시 확인해 주세요.'),{code:'ADVANCEMENT_PASS_STATE_CHANGED'});
    if(attempts===2)throw new Error('response lost');
    return {ok:true,success:true,uniqueAdvancement:{active:true,classCode:'SERVER_CLASS_DEFENSE',dominantType:'DEFENSE'},advancementPass:{quantity:0,spent:1},material:{balanceAfter:0},effectiveSuccessChancePercent:100};
  }});
  const click=attribute=>rootElement.listener({target:{closest(){return {hasAttribute:name=>name===attribute}}},preventDefault(){},stopPropagation(){}});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await controller.load();click('data-ua-advance');click('data-ua-submit');await flush();
  assert.equal(bodies[0].expectedPassUse,true);
  assert.match(rootElement.innerHTML,/최신 전직 상태 다시 확인/);
  assert.doesNotMatch(rootElement.innerHTML,/data-ua-submit/);
  available=false;click('data-ua-retry');await flush();
  assert.equal(controller.overview.successChancePercent,10);assert.equal(controller.overview.advancementPass.willConsume,false);
  available=true;await controller.load(true);click('data-ua-advance');click('data-ua-submit');await flush();
  assert.match(rootElement.innerHTML,/response lost/);
  click('data-ua-submit');await flush();
  assert.equal(bodies[1].expectedPassUse,true);assert.deepEqual(bodies[1],bodies[2],'응답 유실에도 동일 패스권 확인·요청 ID 유지');
  assert.match(rootElement.innerHTML,/전직 패스권 1개를 사용했습니다/);
  assert.equal(controller.overview.advancementPass.quantity,0);assert.ok(cleared.includes('inventory'));
});
