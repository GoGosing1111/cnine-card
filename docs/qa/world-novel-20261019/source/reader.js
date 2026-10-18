import {COLLECTIONS,CHAPTERS,SCENES,BOOKS,CHARACTERS,artUrl,readBookmark,saveBookmark,readHistory,completeBook,sceneFromHash,collectionOf,readingMinutes} from './story-library.js';
export * from './story-library.js';

// Importing the narrative in Node does not start the browser UI.
if (typeof document !== 'undefined') startReader();
function startReader(){
  const byId=id=>document.getElementById(id);
  const cover=byId('cover'),reader=byId('reader'),dialog=byId('chapter-dialog');
  const layers=[byId('art-a'),byId('art-b')];
  let storage; try{storage=window.localStorage;}catch{storage=null;}
  let bookmark=readBookmark(storage),historyState=readHistory(storage),current=-1;
  let collection=bookmark?collectionOf(bookmark.index):'volume1';
  let activeLayer=0,artRequest=0,dialogOpener=null,touchStart=null;
  let canStore=!!storage;
  const warmed=new Set();
  const create=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const setAddress=index=>{try{history.replaceState(null,'',`${location.pathname}${location.search}${index>=0?'#scene='+encodeURIComponent(SCENES[index].id):''}`);}catch{}};
  function warm(index){
    const scene=SCENES[index];if(!scene)return;
    const src=artUrl(scene.art);if(warmed.has(src))return;warmed.add(src);
    const img=new Image();img.src=src;
  }
  function showArt(id,position='50% 42%',retry=false){
    const request=++artRequest,src=artUrl(id),active=layers[activeLayer];
    byId('art-error').hidden=true;
    if(!retry&&active.getAttribute('src')===src&&active.naturalWidth){active.style.objectPosition=position;return;}
    const nextLayer=1-activeLayer,img=layers[nextLayer];
    img.style.objectPosition=position;
    img.onload=()=>{if(request!==artRequest)return;img.classList.add('is-visible');layers[activeLayer].classList.remove('is-visible');activeLayer=nextLayer;byId('art-error').hidden=true;};
    img.onerror=()=>{if(request===artRequest)byId('art-error').hidden=false;};
    img.src=src+(retry?'?retry='+Date.now():'');
  }
  function updateStates(){
    document.querySelectorAll('[data-chapter]').forEach(button=>{
      const chapter=Number(button.dataset.chapter),selected=current>=0&&SCENES[current].chapter===chapter;
      button.setAttribute('aria-current',selected?'true':'false');
      button.querySelector('.chapter-state').textContent=selected?'읽는 중':historyState.completed.includes(CHAPTERS[chapter].book)?'다시 읽기':'읽기';
    });
  }
  function chapterList(container,selectedCollection){
    container.replaceChildren();
    CHAPTERS.forEach((chapter,index)=>{
      if(chapter.collection!==selectedCollection)return;
      const button=create('button','chapter-row');button.type='button';button.dataset.chapter=String(index);
      const copy=create('span','chapter-copy');
      copy.append(create('strong','',chapter.title),create('span','chapter-description',chapter.description));
      const num=selectedCollection==='interludes'?String(index-MAIN_COUNT-RAID_COUNT+1).padStart(2,'0'):chapter.label;
      button.append(create('span','chapter-number',num),copy,create('span','chapter-state','읽기'));
      button.addEventListener('click',()=>{if(dialog.open)closeDialog(false);showScene(SCENES.findIndex(s=>s.id===chapter.start),{focus:true});});
      container.append(button);
    });
    updateStates();
  }
  const MAIN_COUNT=CHAPTERS.filter(c=>c.collection==='volume1').length,RAID_COUNT=CHAPTERS.filter(c=>c.collection==='volume2').length;
  function updateCover(){
    const info=COLLECTIONS.find(c=>c.id===collection),scenes=SCENES.filter((s,i)=>collectionOf(i)===collection);
    byId('collection-title').textContent=info.title;byId('collection-description').textContent=info.description;
    const count=CHAPTERS.filter(c=>c.collection===collection).length;
    byId('reading-note').textContent=collection==='interludes'?`${count}편 · 편당 약 ${Math.ceil(readingMinutes(scenes)/count)}분`:`${count}장 · ${scenes.length}장면 · 약 ${readingMinutes(scenes)}분`;
    byId('start-story').hidden=collection==='interludes';
    byId('start-story').textContent=historyState.completed.includes(collection)?'처음부터 다시 읽기':collection==='volume1'?'1부 읽기':'2부 읽기';
    byId('resume-story').hidden=!bookmark||bookmark.completed;
    if(bookmark&&!bookmark.completed){const c=CHAPTERS[SCENES[bookmark.index].chapter];byId('resume-story').textContent=`이어 읽기 · ${c.title}`;}
    byId('save-note').textContent=canStore?'읽던 장면은 이 기기에 저장됩니다.':'이 브라우저에서는 읽던 장면을 저장할 수 없습니다.';
    byId('next-volume').hidden=!historyState.completed.includes('volume1')||collection!=='volume1';
    document.querySelectorAll('#collection-tabs [data-collection]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===collection)));
    chapterList(byId('cover-chapters'),collection);
  }
  function renderCast(cast){
    byId('scene-cast').replaceChildren(...cast.map(id=>{
      const character=CHARACTERS[id],item=create('li','cast-person');
      if(character.image){const img=create('img');img.src=character.image;img.alt='';img.width=36;img.height=48;img.decoding='async';img.onerror=()=>{img.hidden=true;};item.append(img);}
      item.append(create('span','',character.name));return item;
    }));
  }
  function renderLines(lines){
    byId('narrative').replaceChildren(...lines.map(line=>{
      if(typeof line==='string')return create('p','narration',line);
      const speech=create('div','dialogue-line');
      speech.append(create('span','dialogue-speaker',CHARACTERS[line.speaker].name),create('p','',`“${line.text}”`));
      return speech;
    }));
  }
  function showScene(index,{address=true,focus=false,scroll=true}={}){
    if(!Number.isInteger(index)||!SCENES[index])return;
    current=index;collection=collectionOf(index);
    const scene=SCENES[index],chapter=CHAPTERS[scene.chapter],book=BOOKS[scene.book],offset=book.indexOf(index);
    const chapterScenes=SCENES.filter(s=>s.chapter===scene.chapter),sceneNo=chapterScenes.findIndex(s=>s.id===scene.id)+1;
    cover.hidden=true;reader.hidden=false;document.body.classList.add('is-reading');
    byId('scene-location').textContent=scene.location;
    byId('scene-counter').textContent=`${sceneNo} / ${chapterScenes.length}`;
    byId('chapter-label').textContent=`${COLLECTIONS.find(c=>c.id===collection).label} · ${chapter.title}`;
    byId('scene-title').textContent=scene.title;
    renderCast(scene.cast);renderLines(scene.lines);
    byId('previous-scene').disabled=offset===0;
    const last=offset===book.length-1;
    byId('next-scene').textContent=last?'이야기 마치기':SCENES[book[offset+1]].chapter!==scene.chapter?'다음 장 →':'다음 →';
    byId('progress-label').textContent=`${offset+1} / ${book.length}`;
    byId('story-progress').max=book.length;byId('story-progress').value=offset+1;
    byId('book-end-note').hidden=!last;
    byId('book-end-note').textContent=collection==='volume1'?'1부 끝 · 2부와 용병 이야기에서 계속됩니다.':collection==='volume2'?'2부 끝 · 남겨 둔 의뢰는 계속됩니다.':'이 이야기 끝 · 다른 용병 이야기로 이어가세요.';
    showArt(scene.art,scene.position);
    bookmark={index,completed:false};canStore=saveBookmark(storage,index);
    updateStates();if(address)setAddress(index);warm(book[offset+1]);
    if(scroll)window.scrollTo({top:0,behavior:'instant'});
    if(focus)byId('scene-title').focus({preventScroll:true});
  }
  function showCover({address=true,focus=true}={}){
    current=-1;cover.hidden=false;reader.hidden=true;document.body.classList.remove('is-reading');
    showArt(collection==='interludes'?'commonRoom':'city');updateCover();if(address)setAddress(-1);
    window.scrollTo({top:0,behavior:'instant'});
    if(focus)byId('cover-title').focus({preventScroll:true});
  }
  function advance(){
    if(current<0||dialog.open)return;
    const book=BOOKS[SCENES[current].book],offset=book.indexOf(current);
    if(offset===book.length-1){completeBook(storage,historyState,SCENES[current].book);bookmark={index:current,completed:true};canStore=saveBookmark(storage,current,true);showCover();}
    else showScene(book[offset+1],{focus:true});
  }
  function previous(){
    if(current<0||dialog.open)return;
    const book=BOOKS[SCENES[current].book],offset=book.indexOf(current);
    if(offset>0)showScene(book[offset-1],{focus:true});
  }
  function closeDialog(restore=true){dialog.close();if(restore)dialogOpener?.focus({preventScroll:true});}
  function selectCollection(id){collection=id;updateCover();showArt(id==='interludes'?'commonRoom':'city');}
  function populateTabs(container,forDialog){
    COLLECTIONS.forEach(info=>{
      const button=create('button','collection-tab',info.label);button.type='button';button.dataset.collection=info.id;button.setAttribute('aria-pressed',String(info.id===collection));
      button.addEventListener('click',()=>{
        if(forDialog){chapterList(byId('dialog-chapters'),info.id);container.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}
        else selectCollection(info.id);
      });container.append(button);
    });
  }
  populateTabs(byId('collection-tabs'),false);populateTabs(byId('dialog-tabs'),true);
  byId('start-story').addEventListener('click',()=>showScene(BOOKS[collection]?.[0]??0,{focus:true}));
  byId('resume-story').addEventListener('click',()=>showScene(bookmark?.index??0,{focus:true}));
  byId('next-volume').addEventListener('click',()=>{selectCollection('volume2');byId('start-story').focus();});
  byId('next-scene').addEventListener('click',advance);byId('previous-scene').addEventListener('click',previous);
  byId('reader-cover').addEventListener('click',()=>showCover());
  byId('open-chapters').addEventListener('click',event=>{
    dialogOpener=event.currentTarget;chapterList(byId('dialog-chapters'),collection);
    byId('dialog-tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.collection===collection)));dialog.showModal();
  });
  byId('close-chapters').addEventListener('click',()=>closeDialog());
  dialog.addEventListener('cancel',()=>dialogOpener?.focus({preventScroll:true}));
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
  byId('retry-art').addEventListener('click',()=>{const scene=SCENES[current];showArt(scene?.art||'city',scene?.position,true);});
  layers[0].addEventListener('error',()=>{if(activeLayer===0)byId('art-error').hidden=false;});
  document.addEventListener('keydown',event=>{
    const target=event.composedPath()[0];
    if(current<0||dialog.open||event.altKey||event.ctrlKey||event.metaKey||event.repeat||target.closest?.('input,textarea,select,[contenteditable],soop-adventure-lobby')||event.composedPath().some(n=>n.tagName==='SOOP-ADVENTURE-LOBBY'))return;
    if(event.key==='ArrowRight'){event.preventDefault();advance();}
    if(event.key==='ArrowLeft'){event.preventDefault();previous();}
  });
  const surface=byId('swipe-surface');
  surface.addEventListener('touchstart',e=>{touchStart=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  surface.addEventListener('touchend',e=>{const start=touchStart;touchStart=null;if(!start||current<0||dialog.open||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>=64&&Math.abs(dx)>Math.abs(dy)*1.6){if(dx<0)advance();else previous();}},{passive:true});
  surface.addEventListener('touchcancel',()=>{touchStart=null;},{passive:true});
  window.addEventListener('hashchange',()=>{const index=sceneFromHash(location.hash);if(index>=0)showScene(index,{address:false,focus:true});else showCover({address:false});});
  window.addEventListener('pageshow',()=>{if(current<0){bookmark=readBookmark(storage)||bookmark;historyState=readHistory(storage);updateCover();}});
  updateCover();const initial=sceneFromHash(location.hash);
  if(initial>=0)showScene(initial,{address:false,scroll:false});else if(layers[0].complete&&!layers[0].naturalWidth)byId('art-error').hidden=false;
}
