import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const wrapper=read('js/battle-v3-live.js'),engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const skill=read('preview/project-v-v3/source/battle/SkillTimeline.js');
const context={window:{}};vm.runInNewContext(wrapper,context);
const report=context.window.ProjectVBattleV3Live.resultHtml;
test('V3 skills keep impacts and cancellation without photo cut-ins, dimming or hit-stop',()=>{
 assert.doesNotMatch(skill,/makeCutIn|cutInTexture|new Sprite|backgroundLayer\.alpha|timeline\.pause\(|ticker\.speed\s*=/);
 assert.match(skill,/onImpact\(\)/);assert.match(skill,/onInterrupt/);assert.match(skill,/skillEffect\.release\(\)/);
 assert.doesNotMatch(engine,/await this\.showBanner\((?!entry\[0\])/);
 assert.match(engine,/instant:Boolean\(this\.livePayload\)/);
 assert.match(engine,/noticeScale=Math\.min/);
});
test('PVE report preserves large rewards, zero rewards, card fragments and suit contribution',()=>{
 const html=report({win:true,data:{result:'WIN',reward:20000000000,magicReward:{amount:3},cardReward:{card:{grade:'SS',title:'검수 <카드>'},duplicate:true,shardGained:100}},battleSuit:{name:'슈트',damage:5000,actions:3}});
 assert.match(html,/토벌 성공/);assert.match(html,/\+20,000,000,000/);assert.match(html,/검수 &lt;카드&gt;/);assert.match(html,/조각 \+100/);assert.match(html,/SERVER_TIMELINE/);assert.match(html,/pveResultConfirm/);
 assert.match(report({data:{reward:0}}),/>0<\/dd>/);
});
test('PVP report keeps negative score, draw verdict and escaped server labels',()=>{
 const html=report({mode:'PVP',data:{result:'LOSE',scoreChange:-27,coinReward:10000000,scoreAdjustment:{label:'<img onerror="bad">',multiplier:20},battleV2:{result:{reason:'ELIMINATION',final:{A:[{hp:0,maxHp:100}],B:[{hp:50,maxHp:100}]}}}}});
 assert.match(html,/랭크전 패배/);assert.match(html,/-27/);assert.match(html,/아군 진영 전멸/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/pvpResultConfirm/);assert.match(html,/50.0%/);
 assert.match(report({mode:'PVP',data:{result:'DRAW'}}),/is-draw/);
 assert.doesNotMatch(report({mode:'PVP',data:{scoreChange:'not-a-number'}}),/NaN/);
});
test('main PVE and PVP both use the shared report with return buttons',()=>{
 assert.match(read('js/battle-v2-live.js'),/resultHtml\(\{data,mode:'PVE'/);
 assert.match(read('js/app.js'),/resultHtml\(\{data:d,mode:'PVP'/);
 assert.match(read('css/battle-v3-live.css'),/v3-report-body\{[^}]*overflow-y:auto/);
 assert.match(read('css/battle-v3-live.css'),/var\(--v3-dock-h,0px\)/);
});
test('survival details include the separate mercenary slot without changing the five-card roster',()=>{
 const html=report({win:true,data:{result:'WIN',battleV2:{result:{final:{A:Array.from({length:5},()=>({hp:100,maxHp:100})),mercenaries:{A:[{hp:50,maxHp:100}]}}}}}});
 assert.match(html,/아군 생존<\/dt><dd>6 \/ 6/);
 assert.match(html,/91.7%/);
 const defeated=report({data:{result:'LOSE',battleV2:{result:{final:{A:[{hp:0,maxHp:100,shield:50,maxShield:50}]}}}}});
 assert.match(defeated,/아군 체력 · 보호막<\/dt><dd>0.0%/);
});
