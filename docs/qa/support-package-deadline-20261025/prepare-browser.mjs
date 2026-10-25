import fs from 'node:fs';
import assert from 'node:assert/strict';
let code=fs.readFileSync(new URL('../../../tests/support-package-bogo-20261025.browser.mjs',import.meta.url),'utf8');
const change=(from,to)=>{assert(code.includes(from),from);code=code.replace(from,to);};
change("'./helpers/support-package-fixture.mjs'","'../../../tests/helpers/support-package-fixture.mjs'");
change("out=path.join(root,'docs/qa/support-package-bogo-20261025')","out=path.resolve(process.argv[2])");
change('let f,lose=false,posts=0,alerts=0;',`let f,lose=false,posts=0,alerts=0;
const publicOrigin=process.env.QA_PUBLIC_SOURCE_ORIGIN||'',publicSources=new Set(['/js/server-support-v1.mjs','/js/support-package-v1.mjs','/js/support-package-alerts-v1.mjs','/shared/support-package-v1.mjs','/admin/server-support-admin-v1.mjs','/admin/support-package-admin-v1.mjs','/css/support-package-v1.css']);
const publicCache=new Map();
async function publicFile(url){if(!publicCache.has(url.pathname)){const r=await fetch(publicOrigin+url.pathname+'?deadline-verify=20261025',{signal:AbortSignal.timeout(25000)});assert(r.ok);publicCache.set(url.pathname,Buffer.from(await r.arrayBuffer()));}return publicCache.get(url.pathname);}
async function checkDeadline(page,selector){const deadline=page.locator(selector);assert.match(await deadline.innerText(),/10월 27일 00:00 종료/);assert.match(await deadline.innerText(),/한국시간/);}`);
change("const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));","if(publicOrigin&&publicSources.has(url.pathname)){res.writeHead(200,{'content-type':mime[path.extname(url.pathname)]});return res.end(await publicFile(url));}\n const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));");
change("await page.locator('.ss-dialog').screenshot({path:path.join(out,'server-info-'+width+'.png')});","await checkDeadline(page,'[data-ss-package]');await page.locator('.ss-dialog').screenshot({path:path.join(out,'server-info-'+width+'.png')});");
change("await page.locator('[data-package-apply]').waitFor();await page.locator('.ss-dialog').screenshot", "await page.locator('[data-package-apply]').waitFor();await checkDeadline(page,'.spkg-event-deadline');assert.equal(await page.locator('.spkg-event-deadline time').getAttribute('datetime'),'2026-10-27T00:00:00+09:00');await page.locator('.ss-dialog').screenshot");
change("await owner.locator('.spkg-alert').screenshot", "await checkDeadline(owner,'.spkg-deadline-note');await owner.locator('.spkg-alert').screenshot");
change("await admin.locator('.spkg-admin').screenshot", "await checkDeadline(admin,'.spkg-event-deadline');await admin.locator('.spkg-admin').screenshot");
change("assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push", "const deadlineMessages=await f.all('SELECT body FROM user_messages');assert(deadlineMessages.every(m=>m.body.includes('2026년 10월 27일 00:00 (한국시간)')&&m.body.includes('10월 26일에서 27일로 넘어가는 자정')));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push");
change('reports.push({width,equalButtonSize:', 'reports.push({width,deadlineDisplay:true,koreanMidnight:true,bankAndOwnerMessages:true,publicSources:publicOrigin?publicCache.size:0,equalButtonSize:');
fs.writeFileSync(new URL('./browser.mjs',import.meta.url),code,{flag:'wx'});
