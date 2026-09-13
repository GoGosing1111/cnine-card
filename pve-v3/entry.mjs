import {TOWER_LIVE_URL,TOWER_LIVE_POLICY} from '../shared/pve-public-release-v2092.mjs';
const content=new URL(location.href).searchParams.get('content')||'tower';
if(content==='tower'&&TOWER_LIVE_POLICY==='LEGACY')location.replace(TOWER_LIVE_URL);
else await import('./app.mjs?v=2092-cow-tower-on');
