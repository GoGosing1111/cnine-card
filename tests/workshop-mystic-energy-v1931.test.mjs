import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const server = readFileSync(new URL('functions/_workshop.js', root), 'utf8');
const client = readFileSync(new URL('js/workshop-v1881.js', root), 'utf8');
const css = readFileSync(new URL('css/workshop-v1881.css', root), 'utf8');
const admin = readFileSync(new URL('admin/workshop-admin-v1668.js', root), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('Mystic Energy is a 10% material-craft recipe with the canonical item identity', () => {
  const itemAt = server.indexOf('STARLIGHT_ARMOR_CORE');
  const fixed = section(server, 'const FIXED_RECIPE_COSTS', 'let foundationPromise');
  assert.notEqual(itemAt, -1, 'canonical Mystic Energy inventory code must be used');
  assert.match(server, /미스틱 에너지/);
  assert.match(server, /MATERIAL_CRAFT/);
  assert.match(server, /INVENTORY_ITEM/);
  assert.match(server, /COIN_AND_CARD_SHARD/);
  assert.match(server, /200_?000_?000/);
  assert.match(server, /5_?000_?000/);
  assert.match(server, /MYSTIC_ENERGY_RECIPE_CODE='WORKSHOP_MYSTIC_ENERGY'/);
  assert.match(server, /MYSTIC_ENERGY_ITEM_CODE='STARLIGHT_ARMOR_CORE'/);
  assert.match(fixed, /category\s*:\s*'MATERIAL_CRAFT'/);
  assert.match(fixed, /outputType\s*:\s*'INVENTORY_ITEM'/);
  assert.match(fixed, /outputRef\s*:\s*MYSTIC_ENERGY_ITEM_CODE/);
  assert.match(fixed, /outputQuantity\s*:\s*1/);
  assert.match(fixed, /paymentMode\s*:\s*'COIN_AND_CARD_SHARD'/);
  assert.match(fixed, /coin\s*:\s*200000000/);
  assert.match(fixed, /cardShards\s*:\s*5000000/);
  assert.match(fixed, /successRate\s*:\s*10/);
  assert.match(server, /WORKSHOP_MYSTIC_ENERGY[\s\S]{0,800}'COIN_AND_CARD_SHARD',200000000,0,(?:5000000,)?10,1,1,1,0,10/);
  assert.match(server, /card_shard_cost/i);
  assert.match(server, /assets\/items\/starlight-armor-core-v1749\.png/);
});

test('canonical Mystic Energy contract overrides stored and CMS-submitted structure', () => {
  const recipes = section(server, 'async function recipeRows', 'async function synthesisRecipeRows');
  const save = section(server, 'async function saveRecipe', 'async function saveSynthesisRecipe');

  assert.match(recipes, /category\s*:\s*fixed\?\.category\?\?row\.category/);
  assert.match(recipes, /output_type\s*:\s*fixed\?\.outputType\?\?row\.output_type/);
  assert.match(recipes, /output_ref\s*:\s*fixed\?\.outputRef\?\?row\.output_ref/);
  assert.match(recipes, /output_quantity\s*:\s*Number\(fixed\?\.outputQuantity\?\?row\.output_quantity/);
  assert.match(recipes, /payment_mode\s*:\s*fixed\?\.paymentMode\?\?row\.payment_mode/);
  assert.match(recipes, /materials\s*:\s*fixed\s*\?\s*\[\]\s*:/);

  assert.match(save, /editingCanonical\s*=\s*String\(before\?\.code/);
  assert.match(save, /recipeCode\s*=\s*editingCanonical\s*\?\s*MYSTIC_ENERGY_RECIPE_CODE\s*:\s*requestedRecipeCode/);
  assert.match(save, /category\s*=\s*fixed\?\.category\?\?code\(raw\.category\)/);
  assert.match(save, /outputType\s*=\s*fixed\?\.outputType/);
  assert.match(save, /outputRef\s*=\s*fixed\?\.outputRef/);
  assert.match(save, /outputQuantity\s*=\s*int\(fixed\?\.outputQuantity/);
  assert.match(save, /paymentMode\s*=\s*fixed\?\.paymentMode/);
  assert.match(save, /materials\s*=\s*fixed\s*\?\s*\[\]\s*:/);
  assert.match(save, /coinCost\s*=\s*normalizeWorkshopCoinCost\(fixed\?\.coin/);
  assert.match(save, /masterStarCost\s*=\s*int\(fixed\s*\?\s*0\s*:/);
  assert.match(save, /successRate\s*=\s*num\(fixed\?\.successRate/);
});

test('workshop state and craft transaction expose and atomically spend card shards', () => {
  const state = section(server, 'async function userWorkshopState', 'function paymentFor');
  const craft = section(server, 'async function craft', 'const SYNTH_RARITIES');

  assert.match(state, /card_shards/);
  assert.match(state, /cardShards\s*:/);
  assert.match(craft, /card_shards\s*>=\s*\?/i, 'the final craft guard must recheck the shard balance');
  assert.match(craft, /UPDATE users SET[\s\S]{0,220}card_shards\s*=\s*card_shards\s*-\s*\?/i, 'coin/shards must be debited inside the guarded craft batch');
  assert.match(craft, /INSERT INTO shard_logs/i);
  assert.match(craft, /WORKSHOP_(?:PAYMENT|MATERIAL_CRAFT)/);
  assert.match(craft, /cardShardSpent|cardShardsSpent|payment\.shards/);
  assert.match(craft, /output_type\s*===\s*'INVENTORY_ITEM'/);
  assert.match(craft, /SELECT status,result_json,error_message FROM \$\{RECEIPT_TABLE\} WHERE request_id=\? AND user_id=\?/);
  assert.match(craft, /prior\?\.status\s*===\s*'COMPLETED'[\s\S]{0,180}replayed\s*:\s*true/);
  assert.match(craft, /INSERT OR IGNORE INTO \$\{RECEIPT_TABLE\}[\s\S]{0,180}'PENDING'/);
  assert.match(craft, /if\s*\(!reserved\.meta\?\.changes\)[\s\S]{0,120}같은 제작 요청/);
  assert.match(craft, /UPDATE \$\{RECEIPT_TABLE\} SET status='COMPLETED'[\s\S]{0,260}request_id=\? AND user_id=\?[\s\S]{0,100}verified/);
});

test('material-craft runtime upgrade is DML-only and never performs schema DDL', () => {
  const upgrade = section(server, 'async function ensureMaterialCraftUpgrade', 'export async function ensureWorkshopFoundation');
  assert.doesNotMatch(upgrade, /ensureWorkshopColumn|ALTER\s+TABLE|execSchema/i);
  assert.match(upgrade, /INSERT INTO inventory_items|INSERT OR REPLACE INTO inventory_items/i);
  assert.match(upgrade, /WORKSHOP_MYSTIC_ENERGY/);
  assert.match(upgrade, /INSERT INTO app_meta|INSERT OR REPLACE INTO app_meta/i);
});

test('recipe output joins never cast an inventory item code to PostgreSQL bigint', () => {
  const recipes = section(server, 'async function recipeRows', 'async function synthesisRecipeRows');
  assert.doesNotMatch(recipes, /CAST\s*\(\s*r\.output_ref\s+AS\s+(?:INTEGER|BIGINT)\s*\)/i);
  assert.doesNotMatch(recipes, /r\.output_ref\s*::\s*(?:INTEGER|BIGINT)/i);
  assert.match(recipes, /(?:CAST\s*\(\s*g\.id\s+AS\s+TEXT\s*\)|g\.id\s*::\s*TEXT)\s*=\s*r\.output_ref/i);
  assert.match(recipes, /(?:CAST\s*\(\s*e\.id\s+AS\s+TEXT\s*\)|e\.id\s*::\s*TEXT)\s*=\s*r\.output_ref/i);
  assert.match(recipes, /i\.code\s*=\s*r\.output_ref/i);
});

test('a non-owner PostgreSQL workshop request cannot prepare ALTER TABLE or call execSchema', async () => {
  const prepared = [];
  const boundValues = [];
  const schemaExecutions = [];
  const oldFoundationMarker = 'safe_runtime_upgrade_v1678_synthesis_rate_scrapyard_rewards';
  const materialMarker = 'safe_runtime_upgrade_v1933_workshop_material_craft_no_schema_change';

  const DB = {
    dialect: 'postgres',
    async execSchema(sql) {
      schemaExecutions.push(String(sql));
      throw new Error('execSchema must not be called by a normal workshop request');
    },
    prepare(sql) {
      const source = String(sql);
      prepared.push(source);
      let bindings = [];
      const statement = {
        bind(...values) {
          bindings = values;
          boundValues.push(...values);
          return statement;
        },
        async first() {
          if (source.includes(oldFoundationMarker)) return { value: '1' };
          if (/SELECT value FROM app_meta WHERE key=\?/i.test(source) && bindings[0] === materialMarker) return null;
          if (/SELECT u\.coin,u\.card_shards/i.test(source)) return { coin: 0, card_shards: 0, master_stars: 0 };
          return null;
        },
        async all() {
          if (/FROM workshop_recipes_v1668 r/i.test(source)) {
            if (/CAST\s*\(\s*r\.output_ref\s+AS\s+(?:INTEGER|BIGINT)\s*\)|r\.output_ref\s*::\s*(?:INTEGER|BIGINT)/i.test(source)) {
              throw new Error('invalid input syntax for type bigint: "STARLIGHT_ARMOR_CORE"');
            }
            return {
              results: [{
                id: 77,
                code: 'WORKSHOP_MYSTIC_ENERGY',
                category: 'VEHICLE',
                name: '미스틱 에너지 제작',
                output_type: 'VEHICLE',
                output_ref: '999',
                output_quantity: 99,
                payment_mode: 'COIN_ONLY',
                coin_cost: 1,
                master_star_cost: 999,
                success_rate: 100,
                is_active: 1,
                is_public: 1,
                owner_test_only: 0,
              }],
            };
          }
          return { results: [] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  };

  const { handleWorkshop } = await import(new URL(`functions/_workshop.js?non-owner-pg=${Date.now()}`, root));
  const result = await handleWorkshop({
    path: 'workshop',
    request: { method: 'GET' },
    env: { DB },
    deps: {
      authenticate: async () => ({ id: 1933, role: 'USER' }),
      json: (payload, status = 200) => ({ payload, status }),
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(
    {
      category: result.payload.recipes[0]?.category,
      outputType: result.payload.recipes[0]?.output_type,
      outputRef: result.payload.recipes[0]?.output_ref,
      outputQuantity: result.payload.recipes[0]?.output_quantity,
      paymentMode: result.payload.recipes[0]?.payment_mode,
      coinCost: result.payload.recipes[0]?.coin_cost,
      cardShardCost: result.payload.recipes[0]?.card_shard_cost,
      masterStarCost: result.payload.recipes[0]?.master_star_cost,
      successRate: result.payload.recipes[0]?.success_rate,
      materials: result.payload.recipes[0]?.materials,
    },
    {
      category: 'MATERIAL_CRAFT',
      outputType: 'INVENTORY_ITEM',
      outputRef: 'STARLIGHT_ARMOR_CORE',
      outputQuantity: 1,
      paymentMode: 'COIN_AND_CARD_SHARD',
      coinCost: 200000000,
      cardShardCost: 5000000,
      masterStarCost: 0,
      successRate: 10,
      materials: [],
    },
  );
  assert.ok(boundValues.includes(materialMarker), 'the missing material-craft marker must be inspected');
  assert.deepEqual(schemaExecutions, []);
  assert.equal(prepared.filter(sql => /ALTER\s+TABLE/i.test(sql)).length, 0);
});

test('CMS locks the canonical recipe and reports shard spend without schema DDL', () => {
  const snapshot = section(server, 'async function adminSnapshot', 'function cleanMaterial');
  const editor = section(admin, 'function editor()', 'function bindMaterialRows');
  const stats = section(admin, 'function stats()', 'function logs()');
  const logs = section(admin, 'function logs()', 'function render()');

  assert.match(editor, /canonical\s*=\s*String\(recipe\.code/);
  assert.match(editor, /CANONICAL RECIPE · 변경 불가/);
  assert.match(editor, /MYSTIC_FIXED_LABEL/);
  assert.ok((editor.match(/readonly aria-readonly="true"/g) || []).length >= 6, 'canonical scalar fields must be read-only');
  assert.match(editor, /locked=canonical\?'disabled aria-disabled="true"'/);
  assert.match(editor, /추가 아이템 재료 없음/);

  assert.match(snapshot, /LEFT JOIN \$\{RECIPE_TABLE\} r ON r\.id=l\.recipe_id/);
  assert.match(snapshot, /CASE WHEN UPPER\(COALESCE\(r\.code,''\)\)='\$\{MYSTIC_ENERGY_RECIPE_CODE\}' THEN \$\{FIXED_RECIPE_COSTS\[MYSTIC_ENERGY_RECIPE_CODE\]\.cardShards\} ELSE 0 END card_shard_spent/);
  assert.doesNotMatch(snapshot, /ALTER\s+TABLE|card_shard_spent\s+(?:INTEGER|BIGINT)/i);
  assert.match(logs, /row\.card_shard_spent/);

  assert.match(stats, /x\.category==='EQUIPMENT_SYNTHESIS'/);
  assert.match(stats, /x\.category==='MATERIAL_CRAFT'/);
  assert.match(stats, /x\.category==='BATTLE_SUIT_CRAFT'/);
  assert.equal((stats.match(/<article>/g) || []).length, 6, 'battle-suit craft must add a sixth metric without replacing existing facilities');
});

test('client keeps material craft and adds battle-suit craft as the fourth facility', () => {
  const nav = section(client, 'function workshopNav()', 'function vehiclePartsBank()');
  const render = section(client, 'function renderWorkshop()', 'function renderScrapyard()');

  assert.deepEqual(
    [...nav.matchAll(/data-ws-section="([^"]+)"/g)].map(match => match[1]),
    ['VEHICLE', 'SYNTHESIS', 'MATERIAL_CRAFT', 'BATTLE_SUIT_CRAFT'],
  );
  assert.match(nav, /data-ws-section="MATERIAL_CRAFT"[\s\S]*?<i>03<\/i>/);
  assert.match(nav, /data-ws-section="BATTLE_SUIT_CRAFT"[\s\S]*?<i>04<\/i>/);
  assert.match(client, /pendingMaterial(?:Craft)?Request/);
  assert.match(client, /prepareMutationRequest\('material(?:Craft)?'/i);
  assert.match(client, /function material(?:Craft)?Panel\s*\(/i);
  assert.match(client, /wallet\?\.cardShards|wallet\.cardShards/);
  assert.match(client, /200_?000_?000|coin_cost/);
  assert.match(client, /5_?000_?000|card_shard_cost/);
  assert.match(client, /api\('workshop\/craft'/);
  assert.match(render, /MATERIAL_CRAFT[\s\S]*?material(?:Craft)?Panel\(\)/i);
});

test('four-facility navigation and craft layouts collapse to one column on mobile', () => {
  assert.match(css, /\.ws81-nav\s*\{[^}]*grid-template-columns\s*:\s*repeat\(4\s*,\s*minmax\(0\s*,\s*1fr\)\)/);
  assert.match(css, /\.ws81-material[^{]*\{[^}]*display\s*:\s*grid/i);
  assert.match(css, /\.ws81-suit-layout\s*\{[^}]*display\s*:\s*grid/i);

  const mobileAt = css.search(/@media\s*\(\s*max-width\s*:\s*(?:680|430)px\s*\)/);
  assert.notEqual(mobileAt, -1, 'mobile workshop breakpoint must exist');
  const mobile = css.slice(mobileAt);
  assert.match(mobile, /\.ws81-nav\s*\{[^}]*grid-template-columns\s*:\s*1fr/);
  assert.match(mobile, /\.ws81-material[^{]*\{[^}]*grid-template-columns\s*:\s*1fr/i);
  assert.match(mobile, /\.ws81-suit-costs\s*\{[^}]*grid-template-columns\s*:\s*1fr/i);
});
