/* Shared inventory-recipe presentation. The server alone spends and rolls. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  function image(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw || /^(?!https?:)[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('//')) return '';
    let key = raw.replace(/^\/+/, '');
    try { key = decodeURIComponent(key); } catch (_) {}
    if (window.SoopketmonWorkshopThumbnails?.[key]) return '/' + window.SoopketmonWorkshopThumbnails[key];
    return /^https?:/i.test(raw) ? raw : '/' + raw.replace(/^\/+/, '').replace(/#/g, '%23');
  }
  function paymentFor(recipe, choice = 'COIN') {
    const mode = recipe.payment_mode || 'COIN_OR_MASTER_STAR';
    const type = mode === 'COIN_ONLY' ? 'COIN' : mode === 'MASTER_STAR_ONLY' ? 'MASTER_STAR' : ['BOTH','COIN_AND_CARD_SHARD'].includes(mode) ? mode : choice === 'MASTER_STAR' ? choice : 'COIN';
    return {type, coin: ['COIN','BOTH','COIN_AND_CARD_SHARD'].includes(type) ? Number(recipe.coin_cost || 0) : 0,
      stars: ['MASTER_STAR','BOTH'].includes(type) ? Number(recipe.master_star_cost || 0) : 0,
      shards: type === 'COIN_AND_CARD_SHARD' ? Number(recipe.card_shard_cost || 0) : 0};
  }
  function requirements(recipe, state, choice) {
    const cost = paymentFor(recipe, choice), rows = [];
    for (const material of recipe.materials || []) {
      const code = material.item_code, item = state.inventory?.[code] || {};
      rows.push({code, name:material.item_name || item.name || code, image:material.image_url || item.image_url,
        owned:Number(item.quantity || 0), required:Number(material.quantity || 0)});
    }
    const add = (code, name, owned, required) => {
      const existing = rows.find(row => row.code === code);
      if (existing) existing.required += required;
      else if (required > 0) rows.push({code, name, owned:Number(owned || 0), required});
    };
    add('COIN', '코인', state.wallet?.coin, cost.coin);
    add('MASTER_STAR', '마스터의 별', state.wallet?.masterStars, cost.stars);
    add('CARD_SHARD', '카드 조각', state.wallet?.cardShards, cost.shards);
    return rows.map(row => ({...row, missing:Math.max(0, row.required - row.owned)}));
  }
  function describe(recipe, state, choice) {
    const rows = requirements(recipe, state, choice);
    return {cost:paymentFor(recipe, choice), rows, ready:!recipe.owned && rows.every(row => row.missing === 0),
      shortage:recipe.owned ? '이미 보유한 차량' : rows.filter(row => row.missing).map(row => `${row.name} ${fmt(row.missing)}개 부족`).join(' · ')};
  }
  function costRows(rows) {
    return rows.map(row => `<article class="ws22-cost ${row.missing ? 'short' : 'ready'}">${row.image ? `<img src="${esc(image(row.image))}" alt="" loading="lazy" decoding="async">` : `<i class="ws22-currency" aria-hidden="true">${row.code === 'COIN' ? 'C' : row.code === 'MASTER_STAR' ? '✦' : '▤'}</i>`}<div><b>${esc(row.name)}</b><span>보유 ${fmt(row.owned)}</span></div><strong>${fmt(row.required)}<small>${row.missing ? `${fmt(row.missing)} 부족` : '충족'}</small></strong></article>`).join('');
  }
  function matches(recipe, query) {
    const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    return normalize([recipe.name, recipe.output_name, recipe.output_rarity, recipe.code, ...(recipe.materials || []).map(row => row.item_name || row.item_code)].join(' ')).includes(normalize(query));
  }
  window.WorkshopRecipes = Object.freeze({paymentFor, requirements, describe, costRows, matches, image});
})();
