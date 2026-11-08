// S1 is the first provider for the common rune socket. Other content can supply
// the same read/equip contract without changing the renderer or empty artwork.
(() => {
 window.SeasonS1RuneSource=Object.freeze({create({request,profile,...callbacks}){
  return window.CharacterRuneSockets.create({
   ...callbacks,
   pendingKey:'cnine-s1-pending:'+Number(profile?.serverUserId||profile?.id||0),
   sourceHref:'/?screen=season',
   read:async()=>{const status=await request('season/status');return status.enabled?status.runes:{enabled:false};},
   equip:body=>request('season/socket',{method:'POST',body:JSON.stringify(body)})
  });
 }});
})();
