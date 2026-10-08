import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {file,root} from './inspect-assets.mjs';
import {MERCENARY_CMS_SEED as seed} from '../../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../../functions/_mercenary_codex.js';
const {chromium}=await import(pathToFileURL('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:62,updated_at:'2026-10-08'});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
try{for(const [name,viewport]of [['pc',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/mercenary-codex/**',async route=>{
  const url=new URL(route.request().url());if(!url.pathname.startsWith('/mercenary-codex/'))return route.continue();
  const p=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  const contentType=p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'text/html';
  try{await route.fulfill({body:await fs.readFile(new URL('../../'+p.slice(1),root)),contentType});}catch{await route.continue();}
 });
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),owned=catalog.cards.filter(c=>['V-997','V-998'].includes(c.code)).map(c=>({...c,totalCopies:1,duplicates:0,level:1,canDeploy:true}));
  const body=url.pathname.endsWith('/mercenary-codex')?catalog:{accountId:7,available:true,coin:'0',cards:owned,loadout:{mercenaryCode:null,revision:0},deployment:{enabled:true}};
  await route.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:8848/mercenary-codex/?view=limited#V-997',{waitUntil:'networkidle'});
 for(const code of ['V-997','V-998']){
  await page.locator('[data-code="'+code+'"]').click();await page.locator('.skill-entry').waitFor();
  const text=await page.locator('#inspection').innerText();if(!text.includes('120,000')||!text.includes('420'))throw Error('Live stats missing');
  await page.screenshot({path:file('qa/codex-'+name+'-'+code+'.png'),fullPage:true});report.push({name,code,skillShown:true,canEquip:await page.locator('[data-equip="'+code+'"]').isEnabled(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 }
 if(errors.length)throw Error(errors.join('|'));await page.close();
}}finally{await browser.close();await fs.writeFile(file('qa/codex-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
