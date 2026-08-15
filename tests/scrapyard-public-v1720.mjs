import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const api=readFileSync(new URL('functions/_scrapyard.js',root),'utf8');
const admin=readFileSync(new URL('admin/scrapyard-admin-v1676.js',root),'utf8');
const css=readFileSync(new URL('css/scrapyard-battle-v1698.css',root),'utf8');

assert.doesNotMatch(api,/PUBLIC_RELEASE_ENABLED/,'legacy public hard lock must stay removed');
assert.match(api,/mode:'OFF',dailyRuns:10/,'missing or corrupt settings must fail closed');
assert.match(api,/const canAccess=\(mode,user\)=>mode==='ON'\|\|mode==='TEST'&&isOwner\(user\)/);
assert.match(api,/if\(!canAccess\(cfg\.mode,user\)\)throw new Error/,'run must revalidate the fresh CMS mode');
assert.match(admin,/\['OFF','TEST','ON'\]/,'CMS must expose the public ON mode');
assert.match(api,/unified_drop_receipts_v1667/,'stale ticket recovery must inspect committed drop receipts');
assert.match(api,/if\(dropCommitted\).*status='CONSUMED'/s,'a granted drop must never be followed by an entry-ticket refund');
assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.ws98-battle \.ws76-monster\{right:0;width:34%;height:50%;bottom:22%\}/);
assert.match(css,/\.ws98-battle \.ws76-monster>div b\{overflow:hidden;[^}]*text-overflow:ellipsis;white-space:nowrap\}/);

console.log('scrapyard public mode and compact monster UI v1720 ok');
