import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ORGANIZATION_DISTRICTS} from '../shared/organization-faction-v1.mjs';
const root=new URL('../',import.meta.url),sourceURL=new URL('assets/ui/organization/map-v2/kostat-2013-municipalities-source.topojson',root);
const bytes=fs.readFileSync(sourceURL),topology=JSON.parse(bytes),geometries=topology.objects.skorea_municipalities_geo.geometries;
const canonical=id=>id<0?~id:id;
const arcCache=new Map();
function arc(id){
 const key=canonical(id);
 if(!arcCache.has(key)){let x=0,y=0;arcCache.set(key,topology.arcs[key].map(p=>[x+=p[0],y+=p[1]]));}
 const points=arcCache.get(key);return id<0?points.slice().reverse():points;
}
const ringsOf=g=>g.type==='Polygon'?g.arcs:g.arcs.flat();
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function dissolve(group){
 const counts=new Map(),signed=new Map();
 for(const g of group)for(const ring of ringsOf(g))for(const id of ring){const key=canonical(id);counts.set(key,(counts.get(key)||0)+1);signed.set(key,id);}
 const edges=[...counts].filter(([,n])=>n===1).map(([key])=>arc(signed.get(key))),rings=[];
 while(edges.length){
  const ring=edges.pop().slice();
  while(!same(ring[0],ring.at(-1))){
   const end=ring.at(-1),index=edges.findIndex(e=>same(e[0],end)||same(e.at(-1),end));
   if(index<0)throw Error('Open administrative boundary');
   let next=edges.splice(index,1)[0];if(!same(next[0],end))next=next.slice().reverse();
   ring.push(...next.slice(1));
  }rings.push(ring);
 }
 return {rings,sourceCodes:group.map(g=>g.properties.code),boundaryArcIds:[...counts].filter(([,n])=>n===1).map(([key])=>key)};
}
const groups=ORGANIZATION_DISTRICTS.map(meta=>{
 const group=geometries.filter(g=>g.properties.code.startsWith(meta.area==='GYEONGGI_SOUTH'?'31':'11')&&(g.properties.name===meta.name||g.properties.name.startsWith(meta.name)&&g.properties.name.endsWith('구')));
 if(!group.length)throw Error('Missing '+meta.name);return {...meta,...dissolve(group)};
});
const lonLat=([x,y])=>[x*topology.transform.scale[0]+topology.transform.translate[0],y*topology.transform.scale[1]+topology.transform.translate[1]];
const latitude=37.4,cos=Math.cos(latitude*Math.PI/180),project=p=>{const [lon,lat]=lonLat(p);return [lon*cos,-lat];};
const points=groups.flatMap(g=>g.rings.flat()).map(project),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
const width=1100,height=1000,pad=50,scale=Math.min((width-pad*2)/(maxX-minX),(height-pad*2)/(maxY-minY)),offsetX=(width-(maxX-minX)*scale)/2,offsetY=(height-(maxY-minY)*scale)/2;
const fit=p=>{const [x,y]=project(p);return[(x-minX)*scale+offsetX,(y-minY)*scale+offsetY];};
const round=n=>Math.round(n*100)/100;
const bounds=rs=>{const pts=rs.flat(),x=pts.map(p=>p[0]),y=pts.map(p=>p[1]);return [Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)].map(round);};
function pointDistance([x,y],rings){
 let inside=false,min=Infinity;
 for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));min=Math.min(min,(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2);
 }return (inside?1:-1)*Math.sqrt(min);
}
function labelPoint(rings,b){
 let best={x:(b[0]+b[2])/2,y:(b[1]+b[3])/2,d:-Infinity},step=Math.max(b[2]-b[0],b[3]-b[1])/10;
 for(let x=b[0];x<=b[2];x+=step)for(let y=b[1];y<=b[3];y+=step){const d=pointDistance([x,y],rings);if(d>best.d)best={x,y,d};}
 while(step>.1){const prev=best;step/=2;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=prev.x+dx*step,y=prev.y+dy*step,d=pointDistance([x,y],rings);if(d>best.d)best={x,y,d};}}
 return best;
}
const toPath=rings=>rings.map(r=>'M'+r.map(p=>p.map(round).join(',')).join('L')+'Z').join('');
const features=groups.map(g=>{const rings=g.rings.map(r=>r.map(fit)),b=bounds(rings),label=labelPoint(rings,b),area=rings.reduce((sum,r)=>sum+Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2,0);return {id:g.id,name:g.name,market:g.market,area:g.area||'SEOUL',path:toPath(rings),x:round(label.x),y:round(label.y),labelRadius:round(label.d),bounds:b,projectedArea:round(area),sourceCodes:g.sourceCodes,boundaryArcIds:g.boundaryArcIds};});
const selectedCodes=new Set(features.flatMap(f=>f.sourceCodes));
const context=geometries.filter(g=>['23','31','32','33','34'].some(prefix=>g.properties.code.startsWith(prefix))&&!selectedCodes.has(g.properties.code)).map(g=>{const rings=dissolve([g]).rings.map(r=>r.map(fit)),b=bounds(rings);return {name:g.properties.name,path:toPath(rings),bounds:b};}).filter(g=>g.bounds[2]>0&&g.bounds[0]<width&&g.bounds[3]>0&&g.bounds[1]<height);
const unionBounds=fs=>{const b=fs.map(f=>f.bounds);return [Math.min(...b.map(v=>v[0])),Math.min(...b.map(v=>v[1])),Math.max(...b.map(v=>v[2])),Math.max(...b.map(v=>v[3]))].map(round);};
const data={version:2,viewBox:'0 0 '+width+' '+height,width,height,projection:{type:'equirectangular',standardParallel:latitude,northUp:true,scale,offsetX,offsetY,minX,minY},source:'통계청 통계지리정보서비스 제공 · KOSTAT 2013',sourceUrl:'https://github.com/southkorea/southkorea-maps/tree/master/kostat/2013',sourceSha256:createHash('sha256').update(bytes).digest('hex'),boundaryYear:2013,license:'KOSTAT SGIS attribution; see NOTICE.md and preserved SGIS permission captures',focusBounds:{all:[0,0,width,height],seoul:unionBounds(features.filter(f=>f.area==='SEOUL')),south:unionBounds(features.filter(f=>f.area==='GYEONGGI_SOUTH'))},context,features};
if(features.length!==46||features.filter(f=>f.area==='SEOUL').length!==25)throw Error('Expected 25 + 21 regions');
const output=new URL('organization/faction/districts-v1.json',root),result=JSON.stringify(data);
if(process.argv.includes('--check')){if(fs.readFileSync(output,'utf8')!==result)throw Error('Organization map is not reproducible');console.log('Verified 46 shared administrative boundaries');}
else{fs.writeFileSync(output,result);console.log('Built 46 administrative regions, '+context.length+' noninteractive context shapes, '+result.length+' bytes');}
