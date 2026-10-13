import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
function runtime(){const modal={innerHTML:'',classList:{add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null},sandbox={document:{body:{classList:{remove(){}}}},setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(read('js/territory-formation-20261013.js'),sandbox);
 const client=read('js/territory-war-v1811.js'),cut=client.lastIndexOf("  document.addEventListener('visibilitychange'");
 vm.runInNewContext(client.slice(0,cut)+`globalThis.qa={setup:(s,m)=>{state=s;modal=m},render,loadout:tw4LoadoutHtml};})();`,sandbox);
 return{...sandbox,modal,set(s){sandbox.qa.setup(s,modal)}};
}
const base=()=>({mode:'ON',round:{id:70,status:'RECRUITING',warfare_version:6},allocation:'INDIVIDUAL',network:{},settings:{teamAName:'수호',teamBName:'정화',energyMax:15},counts:{total:146,A:73,B:73},registration:{canRegister:true,canCancel:true},mine:null});
test('loadout displays actual card portraits and escaped PVP mercenary names',()=>{
 const r=runtime(),s=base();s.round.status='ACTIVE';s.mine={deck_snapshot:'[1,2,3,4,5]',formation_breakdown_json:'{"deckComplete":true}',loadout_bonus_json:JSON.stringify({territoryCards:Array.from({length:5},(_,i)=>({id:i,name:'카드 '+i,rarity:'SSR',image:'/card-'+i+'.png'})),mercenary:{name:'<용병>'}})};
 r.set(s);const html=r.qa.loadout();assert.equal((html.match(/alt="카드 /g)||[]).length,5);assert.match(html,/함께 출전하는 용병/);assert.match(html,/&lt;용병&gt;/);assert.doesNotMatch(html,/<용병>/);
});
test('real recruitment render honors registration eligibility, mandatory roster cancellation lock and OFF mode',()=>{
 const r=runtime(),s=base();s.registration.canRegister=false;r.set(s);r.qa.render();assert.match(r.modal.innerHTML,/data-tw3-register disabled/);
 s.mine={mandatory_clan:1};r.set(s);r.qa.render();assert.doesNotMatch(r.modal.innerHTML,/data-tw3-unregister/);
 s.mode='OFF';r.set(s);r.qa.render();assert.match(r.modal.innerHTML,/data-twf-status="OFF"/);assert.doesNotMatch(r.modal.innerHTML,/data-tw3-register|data-tw3-unregister/);
});
test('preparing and active participants can refresh current PVP loadouts without a truce',()=>{
 const r=runtime(),s=base();s.round.status='PREPARING';s.mine={side:'B',deck_power:987650,deck_snapshot:'[1,2,3,4,5]',formation_breakdown_json:'{"deckComplete":true}'};r.set(s);r.qa.render();assert.match(r.modal.innerHTML,/data-twf-status="PREPARING"/);assert.doesNotMatch(r.modal.innerHTML,/data-tw3-loadout-refresh disabled/);assert.doesNotMatch(r.modal.innerHTML,/data-tw3-attack/);
 s.mine.formation_breakdown_json='{"deckComplete":false}';r.set(s);r.qa.render();assert.match(r.modal.innerHTML,/data-tw3-loadout-refresh><span>전투 준비 최신화/);assert.match(r.modal.innerHTML,/PVP 덱 확인 필요/);
 s.round.status='ACTIVE';s.mine.formation_breakdown_json='{"deckComplete":true}';r.set(s);assert.doesNotMatch(r.qa.loadout(),/data-tw3-loadout-refresh disabled/);
 s.truce={active:true};r.set(s);assert.doesNotMatch(r.qa.loadout(),/data-tw3-loadout-refresh disabled/);
});
test('faction names and battle titles are escaped, malformed snapshots do not fabricate ready cards, state is not mutated',()=>{
 const r=runtime(),s=base();s.settings.teamAName='<img src=x onerror="bad()">';s.round.battle_name='<script>bad()</script>';s.mine={side:'A',formation_breakdown_json:'broken',deck_snapshot:'broken'};
 const before=JSON.stringify(s),html=r.CNineTerritoryFormation.lobby(s);assert.equal(JSON.stringify(s),before);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script|onerror="bad/);assert.equal(r.CNineTerritoryFormation.force(s).complete,false);assert.equal(r.CNineTerritoryFormation.force(s).count,0);
});
test('preserved generated sources, transparent control resources and main loader are connected',()=>{
 const manifest=JSON.parse(read('assets/ui/territory-war/formation-v1/manifest.json')),index=read('index.html'),css=read('css/territory-formation-20261013.css');
 assert.equal(Object.keys(manifest.assets).length,5);
 assert.equal(createHash('sha256').update(readFileSync(new URL('../'+manifest.logo.url.slice(1),import.meta.url))).digest('hex'),manifest.logo.sha256);
 assert.match(runtime().CNineTerritoryFormation.lobby(base()),/soopketmon-logo-approved.png/);
 for(const [key,asset]of Object.entries(manifest.assets)){const source=new URL('../'+asset.source+asset.sourceFile,import.meta.url),output=new URL('../'+asset.url.slice(1),import.meta.url);assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),asset.sourceSha256);assert.equal(createHash('sha256').update(readFileSync(output)).digest('hex'),asset.sha256);if(key.startsWith('button-')){assert.equal(asset.hasAlpha,true);assert.ok(css.includes(key+'.webp'))}}
 assert.ok(index.indexOf('js/territory-formation-20261013.js')<index.indexOf('js/territory-war-v1811.js'));assert.match(index,/css\/territory-formation-20261013\.css/);assert.ok(existsSync(new URL('../preview/territory-formation-20261013-v1/prompts.json',import.meta.url)));
});
