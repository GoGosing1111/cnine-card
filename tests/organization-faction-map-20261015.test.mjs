import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HISTORICAL_ORGANIZATION_DISTRICTS as ORGANIZATION_DISTRICTS} from '../shared/organization-faction-v1.mjs';
const map=JSON.parse(readFileSync(new URL('../organization/faction/districts-v1.json',import.meta.url)));
test('46 map regions share the KOSTAT source and retain city-level topology',()=>{
 const source=readFileSync(new URL('../assets/ui/organization/map-v2/kostat-2013-municipalities-source.topojson',import.meta.url));
 assert.equal(map.sourceSha256,createHash('sha256').update(source).digest('hex'));
 assert.equal(map.boundaryYear,2013);assert.equal(map.features.length,46);
 assert.deepEqual(map.features.map(f=>f.id).sort(),ORGANIZATION_DISTRICTS.map(f=>f.id).sort());
 assert.equal(map.features.filter(f=>f.area==='SEOUL').length,25);
 for(const [name,count] of Object.entries({'부천시':3,'안산시':2,'안양시':2,'성남시':3,'수원시':4,'용인시':3,'화성시':1}))assert.equal(map.features.find(f=>f.name===name).sourceCodes.length,count);
 const sourceGeometries=JSON.parse(source).objects.skorea_municipalities_geo.geometries;
 for(const f of map.features){
  const group=sourceGeometries.filter(g=>f.sourceCodes.includes(g.properties.code)),counts=new Map();
  for(const g of group)for(const ring of g.type==='Polygon'?g.arcs:g.arcs.flat())for(const id of ring){const k=id<0?~id:id;counts.set(k,(counts.get(k)||0)+1);}
  assert.deepEqual(f.boundaryArcIds.slice().sort((a,b)=>a-b),[...counts].filter(([,n])=>n===1).map(([id])=>id).sort((a,b)=>a-b),f.name+' must remove internal ward boundaries');
 }
 const reached=new Set([map.features[0].id]);let changed=true;
 while(changed){changed=false;for(const f of map.features)if(!reached.has(f.id)&&map.features.some(other=>reached.has(other.id)&&f.boundaryArcIds.some(id=>other.boundaryArcIds.includes(id)))){reached.add(f.id);changed=true;}}
 assert.equal(reached.size,46,'all 46 regions connect through real shared boundaries');
 const seoulArea=map.features.filter(f=>f.area==='SEOUL').reduce((sum,f)=>sum+f.projectedArea,0),hwaseongArea=map.features.find(f=>f.name==='화성시').projectedArea;
 assert.ok(seoulArea<hwaseongArea,'Seoul retains its physical area instead of an enlarged inset');
});
