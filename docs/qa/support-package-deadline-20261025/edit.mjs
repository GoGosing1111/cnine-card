import fs from 'node:fs';
import assert from 'node:assert/strict';
function replace(file,from,to,count=1){const s=fs.readFileSync(file,'utf8');assert.equal(s.split(from).length-1,count,file+': expected source');fs.writeFileSync(file,s.split(from).join(to));}
const old='20261025-package-bogo-v1',version='20261025-package-bogo-deadline-v1';
replace('js/support-package-v1.mjs','import {supportPackageSummary}', 'import {supportPackageSummary,supportPackageEventDeadline}');
replace('js/support-package-v1.mjs','const p=data.product,order=result?.order||data.pending;','const p=data.product,order=result?.order||data.pending,deadline=supportPackageEventDeadline(p);');
const deadline='${deadline?`<span class="spkg-event-deadline"><time datetime="${esc(deadline.endsAt)}">${esc(deadline.label)}</time><small>${esc(deadline.detail)}</small></span>`:\'\'}';
replace('js/support-package-v1.mjs','패키지 총 ${p.packageQuantity}개 지급</span></p>','패키지 총 ${p.packageQuantity}개 지급</span>'+deadline+'</p>');
replace('admin/support-package-admin-v1.mjs','import {SUPPORT_PACKAGE,supportPackageSummary}', 'import {SUPPORT_PACKAGE,supportPackageSummary,supportPackageEventDeadline}');
replace('admin/support-package-admin-v1.mjs','const order=selected||pending?.order,product=data?.product||SUPPORT_PACKAGE;','const order=selected||pending?.order,product=data?.product||SUPPORT_PACKAGE,deadline=supportPackageEventDeadline(product);');
replace('admin/support-package-admin-v1.mjs','49,800원 · 패키지 총 ${product.packageQuantity}개 지급</span></p>','49,800원 · 패키지 총 ${product.packageQuantity}개 지급</span>'+deadline+'</p>');
replace('js/support-package-alerts-v1.mjs','import {SUPPORT_PACKAGE,supportPackageSummary}', 'import {SUPPORT_PACKAGE,supportPackageSummary,SUPPORT_PACKAGE_EVENT_DEADLINE}');
replace('js/support-package-alerts-v1.mjs','<p class="spkg-note">입금 확인 후 CMS에서','<p class="spkg-note spkg-deadline-note"><time datetime="${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt)}">1+1 이벤트 · ${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.label)}</time><br>${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.detail)}</p><p class="spkg-note">입금 확인 후 CMS에서');
replace('js/server-support-v1.mjs',"import {jointAccountRequest}","import {SUPPORT_PACKAGE_EVENT_DEADLINE} from '../shared/support-package-v1.mjs?v="+old+"';\nimport {jointAccountRequest}");
replace('js/server-support-v1.mjs','<span>49,800원 · 총 2개 지급</span>','<span>49,800원 · 총 2개 지급</span><span class="spkg-entry-deadline">${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.label)} · 한국시간</span>');
replace('functions/_support_package.js','${supportPackageSummary(SUPPORT_PACKAGE)}\\n신청 번호:','${supportPackageSummary(SUPPORT_PACKAGE)}\\n${SUPPORT_PACKAGE_EVENT_DEADLINE.notice}\\n신청 번호:',2);
for(const file of ['js/support-package-v1.mjs','admin/support-package-admin-v1.mjs','js/support-package-alerts-v1.mjs','js/server-support-v1.mjs','admin/server-support-admin-v1.mjs','admin/index.html','js/adventure-lobby-v2107.js','index.html']){
 const s=fs.readFileSync(file,'utf8');assert(s.includes(old),file);fs.writeFileSync(file,s.replaceAll(old,version));
}
const index=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('service-worker.js','utf8');
const tag=index.match(/js\/app\.js\?v=([^"'&]+)/)?.[1],shell=worker.match(/soop-card-shell-v([^']+)/)?.[1];assert(tag);assert.equal(tag,shell);
const prefix='support-package-deadline-20261025-v1-';assert(!tag.includes(prefix));
replace('index.html','js/app.js?v='+tag,'js/app.js?v='+prefix+tag);
replace('service-worker.js','soop-card-shell-v'+shell,'soop-card-shell-v'+prefix+shell);
console.log('Deadline display and cache links updated; product/fulfillment objects unchanged.');
