import {TOWER_LIVE_URL,TOWER_LIVE_POLICY} from '../shared/pve-public-release-v2092.mjs';
const content=new URL(location.href).searchParams.get('content')||'tower';
if(content==='tower'&&TOWER_LIVE_POLICY==='LEGACY')location.replace(TOWER_LIVE_URL);
else if(content==='cow-room')location.replace('/?screen=battle&pve=cow-room'+(new URL(location.href).searchParams.get('enter')==='1'?'&enter=1':''));
else if(content==='scrapyard')location.replace('/?screen=scrapyard');
else await import('./app.mjs?v=2093-native-pve-hyper');
