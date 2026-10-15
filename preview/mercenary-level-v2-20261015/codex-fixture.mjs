import {mercenaryCodexDocument} from '../../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {levelDemo} from '../../mercenary-codex/leveling/demo.mjs';

// Local GET-only fixtures. The public projection and demo roster are reused;
// no database, account, policy, grant or release state is read or changed.
export function growthCodexPreviewFixture(pathname) {
  if (!['/api/mercenary-codex', '/api/mercenaries/v3/state'].includes(pathname)) return null;
  const catalog = mercenaryCodexDocument({
    payload_json: JSON.stringify(MERCENARY_CMS_SEED.document),
    revision: 0,
    updated_at: '2026-10-15T00:00:00.000Z'
  });
  if (pathname === '/api/mercenary-codex') return catalog;
  const demo = levelDemo();
  const cards = demo.cards.map(card => {
    const publicCard = catalog.cards.find(row => row.code === card.code);
    if (!publicCard) throw Error('MISSING_GROWTH_DEMO_CARD:' + card.code);
    return {
      ...publicCard, ...card, level: card.growth.level, experience: card.growth.experience,
      revision: card.growth.revision, maxLevel: 20, canDeploy: false
    };
  });
  return {
    preview: true, accountId: null, available: false, coin: '0',
    leveling: {enabled: false}, policy: {mode: 'OFF'}, cmsRevision: 0,
    loadout: {mercenaryCode: null, revision: 0},
    loadouts: {PVE: {mercenaryCode: null, revision: 0}, PVP: {mercenaryCode: null, revision: 0}},
    cards
  };
}

export function growthPreviewHtml(html, relativePath) {
  if (!['mercenary-codex/index.html', 'mercenary-codex/leveling/index.html'].includes(relativePath)) return html;
  return html.replace(/<body\b([^>]*)>/i, (_match, attributes) =>
    /\bdata-growth-review\s*=/.test(attributes) ? _match : `<body${attributes} data-growth-review="true">`);
}
