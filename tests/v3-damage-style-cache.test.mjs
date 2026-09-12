import test from 'node:test';
import assert from 'node:assert/strict';
import {createDamageTextPool,configureDamageText} from '../preview/project-v-v3/source/battle/ObjectPool.js';
test('thousands of pooled hits reuse bounded immutable bitmap font styles without changing active labels',()=>{
  const pool=createDamageTextPool(28),seen=new Set();
  try{
    const active=pool.acquire();configureDamageText(active,{kind:'ATTACK',damage:100,critical:true});const before=active.numberLabel.style,fill=before.fill;
    for(let i=0;i<8000;i++){
      const v=pool.acquire();configureDamageText(v,{kind:['ATTACK','DEFENSE','SPEED','HP'][i%4],damage:i*971,critical:Boolean(i&4),compact:Boolean(i&8)});
      for(const label of [v.numberGlow,v.numberLabel,v.roleTag,v.criticalLabel,v.healLabel,v.hitLabel])seen.add(label.style.styleKey);
      pool.release(v);assert.equal(active.numberLabel.style,before);assert.equal(before.fill,fill);
    }
    assert.ok(seen.size<=64,`Only finite role styles are retained: ${seen.size}`);
    assert.equal(pool.stats().total,28);
  }finally{pool.destroy();}
});
