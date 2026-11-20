import {TOWER_LIVE_URL,TOWER_LIVE_POLICY} from '../shared/pve-public-release-v2092.mjs';
const content=new URL(location.href).searchParams.get('content')||'tower';
if(content==='idle-dungeon')location.replace('/?screen=battle');
else if(content==='tower'&&TOWER_LIVE_POLICY==='LEGACY')location.replace(TOWER_LIVE_URL);
else if(content==='cow-room')location.replace('/?screen=battle');
else if(content==='scrapyard')location.replace('/?screen=scrapyard');
else await import('./app.mjs?v=20261120-legion-cow&retired=20261001');
