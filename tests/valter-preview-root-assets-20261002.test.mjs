import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('SSS standalone preview bundle resolves both background textures at the site root after Pages clean-URL redirects',()=>{
 const prefix='preview/mercenary-crimson-silver-knight-battle-v1/',bundle=fs.readFileSync(prefix+'preview.bundle.js','utf8');
 for(const path of ['/assets/ui/coin-prediction/arena-v1.png','/assets/ui/idle-dungeon/enchanted-card-battlefield-v4.webp']){assert.ok(bundle.includes('"'+path+'"'),path+' must be absolute');assert.equal(new URL(path,'https://cnine-card.pages.dev/'+prefix+'battle/').pathname,path);assert.equal(bundle.includes('"../..'+path+'"'),false);}
 const engine=fs.readFileSync('preview/project-v-v3/source/project-v-pixi-battle.src.js','utf8'),version=engine.match(/runtimeVersion:'([^']+)'/)[1];assert.ok(bundle.includes('runtimeVersion:"'+version+'"'),'preview must use current runtime so live loader preserves its mount hook');
 assert.match(fs.readFileSync(prefix+'battle.html','utf8'),/preview\.bundle\.js\?v=20261002-valter-pages-path/);
});
