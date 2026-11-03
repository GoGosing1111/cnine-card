import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('./',import.meta.url),POST=1441569,origin='https://www.playdk.kr',hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const get=async(path)=>{const url=origin+path,r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return {url,fetchedAt:new Date().toISOString(),body:await r.json()};};
const before=await get('/api/v2/p/post/'+POST);assert.equal(before.body.board.slug,'skm');assert.equal(before.body.id,POST);
const pages=[];let total=0,size=50;
for(let page=1;page===1||page<=Math.ceil(total/size);page++){
 const r=await get(`/api/v2/p/comment?postId=${POST}&page=${page}&size=${size}&orderBy=createdAt&order=asc`);assert.equal(r.body.page,page);assert.equal(r.body.size,size);if(page===1)total=r.body.total;assert.equal(r.body.total,total,'Comment count changed during pagination');pages.push(r);
}
const comments=pages.flatMap(p=>p.body.data);assert.equal(comments.length,total);assert.equal(new Set(comments.map(c=>c.id)).size,total);assert(comments.every(c=>c.postId===POST&&c.entityType==='PO'&&c.entityId===POST));
const reread=await get(`/api/v2/p/comment?postId=${POST}&page=1&size=${size}&orderBy=createdAt&order=asc`);assert.equal(reread.body.total,total);assert.deepEqual(reread.body.data.map(c=>c.id),pages[0].body.data.map(c=>c.id));
const after=await get('/api/v2/p/post/'+POST);assert.equal(after.body.stat.commentCount,total);assert.equal(before.body.stat.commentCount,total);
const authors=new Map(),unattributable=[];
for(const c of comments){if(!c.author?.uuid){unattributable.push({commentId:c.id,name:c.author?.name||null,reason:'NO_PUBLIC_AUTHOR_UUID'});continue;}const a=authors.get(c.author.uuid)||{uuid:c.author.uuid,names:[],commentIds:[]};if(!a.names.includes(c.author.name))a.names.push(c.author.name);a.commentIds.push(c.id);authors.set(c.author.uuid,a);}
const selected=[...authors.values()].sort((a,b)=>a.uuid.localeCompare(b.uuid));
const source={operationKey:'ops:playdk:1441569:comment-coin500t:20261103:v1',authorization:'https://www.playdk.kr/board/skm/1441569 댓글 전체 2차인증 검증 후 500조씩 지급',sourceUrl:origin+'/board/skm/'+POST,sourceApi:origin+'/api/v2/p/comment',postId:POST,board:'skm',title:after.body.title,collectedAt:reread.fetchedAt,selection:'All publicly returned comments and replies in the stable complete snapshot; one reward per verified game account',commentCount:total,pages:pages.length,pageSize:size,uniqueAuthors:selected.length,selected,unattributable,commentIds:comments.map(c=>c.id),rawCommentsHash:hash(comments)};
await fs.mkdir(new URL('./evidence/',base),{recursive:true});
for(const [file,data] of [['evidence/comments-full.json',{before,pages,reread,after}],['source.json',source]])await fs.writeFile(new URL(file,base),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({postId:POST,title:source.title,comments:total,pages:pages.length,uniqueAuthors:selected.length,duplicateComments:comments.length-selected.length,unattributable,optionalKeys:[...new Set(comments.flatMap(c=>Object.keys(c)))],sourceHash:hash(source),collectedAt:source.collectedAt}));
