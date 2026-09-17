import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DISTRICTS} from '../shared/clan-faction-rules-v1.mjs';
const root = new URL('../assets/ui/clan/seoul/',import.meta.url);
const source = fs.readFileSync(new URL('districts-source.geojson',root));
const data = JSON.parse(source),project=([lng,lat])=>[lng*Math.cos(37.55*Math.PI/180),-lat];
const all = data.features.flatMap(f=>f.geometry.coordinates.flat()).map(project);
const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);
const scale=Math.min(850/(Math.max(...xs)-minX),660/(Math.max(...ys)-minY));
const p=point=>{const [x,y]=project(point);return[(x-minX)*scale+25,(y-minY)*scale+25]};
const features=data.features.map(f=>{
  const district=DISTRICTS.find(d=>d.name===f.properties.name);
  if(!district)throw Error(f.properties.name);
  const rings=f.geometry.coordinates.map(r=>r.map(p));
  const r=rings[0];let area=0,cx=0,cy=0;
  for(let i=0;i<r.length-1;i++){const [x,y]=r[i],[a,b]=r[i+1],cross=x*b-a*y;area+=cross;cx+=(x+a)*cross;cy+=(y+b)*cross;}
  return {...district,path:rings.map(r=>'M'+r.map(v=>v.map(n=>n.toFixed(1)).join(',')).join('L')+'Z').join(''),x:+(cx/(3*area)).toFixed(1),y:+(cy/(3*area)).toFixed(1)};
});
if(features.length!==25)throw Error('Expected 25 districts');
fs.writeFileSync(new URL('districts-v1.json',root),JSON.stringify({viewBox:'0 0 900 710',source:'southkorea/seoul-maps · KOSTAT 2013',license:'Apache-2.0',sourceSha256:createHash('sha256').update(source).digest('hex'),features}));
console.log('Built Seoul 25-district SVG geometry');
