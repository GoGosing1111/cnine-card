// Keep map layers, focused buttons and unchanged resident rows mounted between polls.
// This patcher is local to the city's delegated-event view; dialogs render separately.
function key(node){
  if(node.nodeType!==1)return String(node.nodeType);
  const identity=node.id||node.getAttribute('data-city-person')||node.getAttribute('data-city-place')||node.getAttribute('data-city-action')||node.classList[0]||'';
  return node.namespaceURI+':'+node.localName+':'+identity;
}
function patchNode(current,next){
  if(current.nodeType===1&&current.localName==='input'&&next.type==='checkbox'&&!next.disabled)current.checked=next.checked;
  if(current.isEqualNode(next))return;
  if(current.nodeType!==1){current.nodeValue=next.nodeValue;return;}
  for(const attribute of [...current.attributes])if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
  for(const attribute of next.attributes)if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
  patchChildren(current,next);
}
function patchChildren(current,next){
  let cursor=current.firstChild;
  for(const desired of [...next.childNodes]){
    const desiredKey=key(desired);
    let match=cursor;
    while(match&&key(match)!==desiredKey)match=match.nextSibling;
    if(!match){current.insertBefore(desired,cursor);continue;}
    if(match!==cursor)current.insertBefore(match,cursor);
    patchNode(match,desired);
    cursor=match.nextSibling;
  }
  while(cursor){const removed=cursor;cursor=cursor.nextSibling;removed.remove();}
}
export function patchCityView(root,markup){
  const template=root.ownerDocument.createElement('template');
  template.innerHTML=markup;
  patchChildren(root,template.content);
  // A checkbox's live property can differ from its unchanged server attribute
  // after a failed preference save. Preserve the user's choice while saving,
  // then reconcile it even when its subtree is equal.
  for(const checkbox of root.querySelectorAll('input[type="checkbox"]:not(:disabled)'))checkbox.checked=checkbox.hasAttribute('checked');
}
