// Per-route keys make add/remove idempotent and avoid overwriting another
// device's edits. This reuses app_meta; no account or economy schema changes.
export const FAVORITE_MENU_ROUTES = Object.freeze([
  'inventory','buy','lootShop','dex','mercenaryDex','petDex','upgrade','evolution','iconfusion','magic',
  'battle','deck','hunt','coop','legion','raid','escort','siege','seal','tower','scrapyard','masterStarMine',
  'pvp','jokgakCity','duo','rank','clanWar','clanFaction','clan','territory','character','avatar',
  'vehicle','fusion','alchemy','attendance','dailyquest','messages','mineral','chicken','goldenAxe',
  'prediction','auction','coup','soopketland','prison','prisoncamp','mercenaryEquipment','equipmentForge','seasonPass'
]);
const allowed = new Set(FAVORITE_MENU_ROUTES);
const prefixFor = id => `menu_favorite_v1:${id}:`;

export async function handleMenuFavorites({path,request,env,deps}) {
  if (path !== 'me/menu-favorites') return null;
  const {authenticate,readBody,json} = deps;
  const user = await authenticate(request,env);
  if (!user) return json({error:'로그인이 필요합니다.'},401);
  const prefix = prefixFor(user.id);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT key FROM app_meta WHERE key LIKE ? ORDER BY value,key').bind(prefix+'%').all();
    const routes = (rows.results||[]).map(row=>row.key.slice(prefix.length)).filter(route=>allowed.has(route));
    return json({userId:user.id,routes});
  }
  if (request.method !== 'POST') return json({error:'지원하지 않는 요청입니다.'},405);
  const body = await readBody(request);
  if (!body || !allowed.has(body.route) || typeof body.favorite !== 'boolean') {
    return json({error:'즐겨찾기 메뉴와 설정을 확인하세요.'},400);
  }
  const key = prefix+body.route;
  if (body.favorite) {
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,String(Date.now())).run();
  } else {
    await env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(key).run();
  }
  return json({userId:user.id,route:body.route,favorite:body.favorite});
}
