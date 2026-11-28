// PLAY DK board timestamps without an offset are Korea local time.
function createdTime(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value+'+09:00');
}
function bounds(day) {
  const start=Date.parse(day+'T00:00:00+09:00');
  return {start,end:start+86400000,from:day+'T00:00:00',
    to:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T00:00:00'};
}
const invalid=()=>{throw Error('PLAY DK 공개 게시글을 확인하지 못했습니다.');};
function normalize(row,slug,period) {
  if (!row || row.board?.slug!==slug || !Number.isSafeInteger(row.id) || row.id<=0) invalid();
  const time=createdTime(row.createdAt);
  if (!Number.isFinite(time) || time<period.start || time>=period.end) invalid();
  if (row.deletedAt || row.blind===true) return null;
  if (row.blind!==false) invalid();
  return {id:slug+'/'+row.id,createdAt:new Date(time).toISOString(),author:row.author?.uuid || null};
}
const groupSize=3;
async function pages(read,slug,period,author,visit) {
  const params={boardSlug:slug,size:100,order:'asc',orderBy:'createdAt',viewMode:'list',
    createdAtGte:period.from,createdAtLt:period.to,...(author?{authorUuid:author}:{})};
  async function page(n) {
    const body=await read('/api/v2/p/post',{...params,page:n});
    if (!Array.isArray(body?.data) || body.page!==n || body.size!==100 || !Number.isSafeInteger(body.total) || body.total<0 ||
      body.data.length>100 || typeof body.more!=='boolean' || body.more && body.data.length!==100) invalid();
    for (const row of body.data) visit(normalize(row,slug,period),slug+'/'+row.id);
    return body;
  }
  // Freeze the initial page count. New arrivals during an in-progress day appear in the next collection.
  const first=await page(1), last=Math.ceil(first.total/100);
  for (let i=2;i<=last;i+=groupSize) {
    await Promise.all(Array.from({length:Math.min(groupSize,last-i+1)},(_,n)=>page(i+n)));
  }
}
export function breadBoardClient(baseUrl,fetcher,timeoutMs) {
  async function read(path,params,allowMissing=false) {
    const url=new URL(path,baseUrl);
    for (const [name,value] of Object.entries(params)) url.searchParams.set(name,String(value));
    const response=await fetcher(url,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
    if (allowMissing && [404,410].includes(response.status)) return null;
    if (!response.ok) invalid();
    return response.json();
  }
  async function details(slug,nums,period,visit) {
    for (let i=0;i<nums.length;i+=groupSize) await Promise.all(nums.slice(i,i+groupSize).map(async num=>{
      if (!/^[1-9]\d*$/.test(num)) invalid();
      const row=await read('/api/v2/p/post/'+num,{boardSlug:slug,withAdjacent:false},true);
      if (!row) return;
      if (String(row.id)!==num) invalid();
      visit(normalize(row,slug,period));
    }));
  }
  return {
    async getVisibleDailyPosts({userUuid,boardSlugs,questDate},daily) {
      const signed=await daily({userUuid,boardSlugs,questDate});
      if (signed.userUuid!==userUuid || signed.questDate!==questDate || signed.timezone!=='Asia/Seoul' ||
        JSON.stringify([...signed.boardSlugs].sort())!==JSON.stringify([...boardSlugs].sort())) invalid();
      if (!signed.count) return [];
      const bound=new Set(signed.posts.map(post=>post.boardSlug+'/'+post.postId));
      const period=bounds(questDate), visible=new Map(), seen=new Set();
      const accept=post=>{
        if (post && (post.author===userUuid || (!post.author && bound.has(post.id)))) visible.set(post.id.split('/')[1],post);
      };
      for (const slug of boardSlugs) {
        await pages(read,slug,period,userUuid,(post,key)=>{
          seen.add(key);
          // Unknown account filters can return the whole board. Authorless posts require signed ownership.
          if (post && !post.author && !bound.has(key) && signed.postsTruncated) invalid();
          accept(post);
        });
        const missing=signed.posts.filter(row=>row.boardSlug===slug && !seen.has(slug+'/'+row.postId)).map(row=>row.postId);
        await details(slug,[...new Set(missing)],period,accept);
      }
      return [...visible.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    },
    async verifyBreadPosts(day,targets) {
      const wanted=new Map(targets.map(post=>[post.id,post.author])), valid=new Set(), boards=new Map(), period=bounds(day);
      for (const id of wanted.keys()) {
        const [slug,num]=id.split('/');
        if (!/^[a-z0-9_-]{1,80}$/.test(slug) || !/^[1-9]\d*$/.test(num)) invalid();
        if (!boards.has(slug)) boards.set(slug,[]);
        boards.get(slug).push(num);
      }
      const accept=post=>{
        if (post && wanted.has(post.id) && (!post.author || wanted.get(post.id)===post.author)) valid.add(post.id);
      };
      for (const [slug,ids] of boards) {
        if (ids.length<=groupSize) { await details(slug,ids,period,accept); continue; }
        const authors=new Set(ids.map(num=>wanted.get(slug+'/'+num)));
        if (authors.size===1 && !authors.has(null)) {
          const seen=new Set();
          await pages(read,slug,period,[...authors][0],(post,key)=>{seen.add(key);accept(post);});
          await details(slug,ids.filter(num=>!seen.has(slug+'/'+num)),period,accept);
        } else await pages(read,slug,period,null,accept);
      }
      return valid;
    }
  };
}
