import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleWishLamp} from '../functions/_wish_lamp.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('retired wish lamp cannot charge, grant, recreate tickets or be turned back on by cached clients',async()=>{
 const env=new Proxy({},{get(){throw Error('Retired route must not access DB');}}),deps={json:(v,s=200)=>Response.json(v,{status:s})};
 for(const path of ['events/wish-lamp/state','events/wish-lamp/open','admin/wish-lamp'])for(const method of ['GET','POST','PATCH']){const result=await handleWishLamp({path,request:new Request('https://game.test/api/'+path,{method}),env,deps});assert.equal(result.status,410);assert.equal((await result.json()).code,'WISH_LAMP_RETIRED');}
 const result=await handleWishLamp({path:'events/wish-lamp/feature',env,deps});assert.deepEqual(await result.json(),{visible:false,phase:'RETIRED',name:'종료된 이벤트'});
 assert.equal(await handleWishLamp({path:'events/chuseok/state',env,deps}),null);
});
test('live menu, CMS and old page links retire wish lamp and point at the new event',()=>{
 const nav=read('js/soopketmon-v21-exact-shell-adapter.js');assert(!nav.includes("wishLamp:"));assert.match(nav,/chuseok: Object.freeze/);
 assert(!read('admin/index.html').includes('wish-lamp-v2077.js'));assert.match(read('events/wish-lamp/index.html'),/url=\/events\/chuseok\//);
 assert(!read('functions/_wish_lamp.js').includes('INSERT INTO'));assert(read('functions/api/[[path]].js').includes("i.code NOT IN ('PINGDU_WISH_TICKET','PINGDU_OLD_AXE')"));
});
