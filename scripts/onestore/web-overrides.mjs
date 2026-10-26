import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {excludedAsset} from '../../packaging/onestore/web/policy.mjs';
export async function createWebOverrides(repo){
const hashes={},overrides=new Map();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function source(file){const bytes=await readFile(join(repo,file));hashes[file]=hash(bytes);return bytes.toString('utf8').replace(/\r\n/g,'\n');}
function once(text,from,to,label){const index=text.indexOf(from);if(index<0||text.indexOf(from,index+from.length)>=0)throw Error('Source changed: '+label);return text.slice(0,index)+to+text.slice(index+from.length);}
// A strict patch applies in memory; the live website and direct clients are
// never edited, generated, deployed, or copied as a whole by this build.
const patch=JSON.parse(await source('packaging/onestore/web/client-patch.json')).patch;
for(const section of patch.split(/(?=^diff --git )/m).filter(Boolean)){
  const file=/^diff --git a\/(.+) b\/(.+)$/m.exec(section)?.[2];if(!file)throw Error('Invalid client patch');
  let lines=(await source(file)).split('\n'),offset=0;
  for(const hunk of section.split(/(?=^@@ )/m).slice(1)){
    const header=/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n/.exec(hunk);if(!header)throw Error('Invalid patch hunk');
    const body=hunk.slice(header[0].length).split('\n').filter(line=>line.startsWith(' ')||line.startsWith('+')||line.startsWith('-'));
    const before=body.filter(l=>!l.startsWith('+')).map(l=>l.slice(1)),after=body.filter(l=>!l.startsWith('-')).map(l=>l.slice(1));
    const at=Number(header[1])-1+offset;
    if(lines.slice(at,at+before.length).join('\n')!==before.join('\n'))throw Error('Patch does not match '+file);
    lines.splice(at,before.length,...after);offset+=after.length-before.length;
  }
  overrides.set('/'+file,lines.join('\n'));
}
let html=overrides.get('/index.html');
html=html.replace(/<(?:script\b[^>]*\bsrc|link\b[^>]*\bhref)=["']([^"']+)["'][^>]*>(?:<\/script>)?/g,(tag,url)=>excludedAsset(new URL(url,'https://cnine-card.pages.dev').pathname)?'':tag);
overrides.set('/index.html',html);
let lobby=await source('js/adventure-lobby-v2107.js');
lobby=once(lobby,"      void import('/js/server-support-v1.mjs?v=20261020-package2-pass-sales-start-v1').then(({mountServerSupportNavigation})=>{\n        if(!supportSignal.aborted)this.supportNavigation=mountServerSupportNavigation({root,getUser,signal:supportSignal,onOpenMessages:()=>settings.navigate?settings.navigate('messages'):global.SoopketmonV21ExactShell.navigate('messages'),onSeasonPassVisibilityChange:visible=>{this.seasonPassVisible=visible;this.controls?.refreshMenus();}});\n      }).catch(()=>{});",'', 'support navigation');
lobby=once(lobby,"  entries.push({id:'seasonPass',title:'시즌패스',category:'rewards',description:'후원 적용일부터 30일 · 당일 보상 수령'});",'', 'pass menu');
lobby=once(lobby,"        isSeasonPassVisible:()=>this.seasonPassVisible===true,","        isRouteVisible:id=>window.CNineStorePolicy.allowsRoute(id)&&(settings.isRouteVisible?settings.isRouteVisible(id):['world','equipmentForge','mercenaryEquipment'].includes(id)||global.SoopketmonV21ExactShell?.isRouteVisible(id)!==false),\n        isSeasonPassVisible:()=>false,",'lobby route policy');
overrides.set('/js/adventure-lobby-v2107.js',lobby);
let pet=await source('js/pet-equipment-window-v1.mjs');
pet=once(pet,'  async function loadSupport(){','  async function loadSupport(){\n    support=null;pendingSupport=null;supportError="";return;','pet support request');
pet=once(pet,"        try{pendingSupport=JSON.parse(localStorage.getItem(supportKey())||'null');}catch{pendingSupport=null;}","        pendingSupport=null; // Shared website claim drafts stay untouched and hidden.",'pet pending support draft');
overrides.set('/js/pet-equipment-window-v1.mjs',pet);
let app=overrides.get('/js/app.js');
app=app.replace(/<button class="message-cleanup-all"[^]*?<\/small>/,'');
app=once(app,"m.message_type==='SUPPORT_BANK_ACCOUNT'?'후원 신청 · 계좌 안내':escapeHtml(m.message_type)","escapeHtml(m.message_type)",'message labels');
// Never bulk-delete hidden records from the shared account.
app=once(app,'async function deleteCompletedMessages(){','async function deleteCompletedMessages(){\n  return;','bulk message cleanup');
overrides.set('/js/app.js',app);
const compiled=await build({entryPoints:[join(repo,'packaging/onestore/web/bootstrap.mjs')],bundle:true,write:false,format:'iife',target:'es2020',minify:true});
overrides.set('/js/store-distribution-v1.js',compiled.outputFiles[0].text);
return {overrides,hashes,source,once,hash};
}
