import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyKnightScreen(page, {boss, battle, width, out}) {
  const expected = battle.result.timeline.filter(event => event.type === 'APOCALYPSE_SKILL');
  assert.equal(expected.length, 3);
  await page.evaluate(async ({id, codes}) => {
    const engine = await ProjectVPixiBattle.mount();
    const probe = window.__knights = {casts: {}, facings: 0, wrongFacing: 0, textureIds: new Set()};
    const sample = () => {
      const actor = engine.enemies.find(a => a.battleCard?.cardId === 'MONSTER:' + id);
      const body = actor?.fullBodySprite;
      if (!body?.visible || !actor.root.visible || !actor.battleActive || actor.hp <= 0) return;
      const left = body.toGlobal({x:-10, y:-40}), right = body.toGlobal({x:10, y:-40});
      if (left.x >= right.x || actor.artFacing !== -1) probe.wrongFacing++;
      probe.facings++;
      probe.active = null;
      probe.textureIds.add(body.texture.uid);
      for (const fx of engine.effectLayer.children) {
        if (!codes.includes(fx.label) || fx.alpha < .08) continue;
        probe.casts[fx.label] = fx.children.length;
        probe.active = fx.label;
      }
    };
    // The normal V3 ticker observes the actual transforms and marks drawn in this fight.
    engine.app.ticker.add(sample);
    probe.finish = () => {
      engine.app.ticker.remove(sample);
      return {facings:probe.facings, wrongFacing:probe.wrongFacing, textures:probe.textureIds.size,
        casts:probe.casts, remainingMarks:engine.effectLayer.children.filter(fx => codes.includes(fx.label)).length,
        overflow:document.documentElement.scrollWidth > innerWidth};
    };
  }, {id:boss.monsterId,codes:boss.skills.map(s => s.code)});
  await page.locator('.apocalypse-dodge .is-safe').click();
  await page.waitForFunction(code => window.__knights?.active === code, boss.skills[0].code, {timeout:90000});
  await page.screenshot({path:path.join(out,boss.key + '-' + width + '.png')});
  await page.locator('#pveResultConfirm').waitFor({timeout:180000});
  const result = await page.evaluate(() => window.__knights.finish());
  assert(result.facings > 3);
  assert.equal(result.wrongFacing, 0);
  assert.equal(result.textures, 1);
  for (const event of expected) assert.equal(result.casts[event.skillCode], event.hits.length, event.skillCode);
  assert.equal(result.remainingMarks, 0);
  assert.equal(result.overflow, false);
  return result;
}
