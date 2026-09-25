// Read the persisted document first. Normal CMS visits must not execute DDL or
// seed writes (which also evict the PostgreSQL adapter's shared catalog cache).
export async function readRegisteredMercenaryCms(read,initialize,tables) {
  let state;
  try{state=await read();}catch(error){
    const message=String(error?.message||'');
    const missing=(error?.code==='42P01'||/no such table:|relation .+ does not exist/i.test(message))
      &&tables.some(table=>message.includes(table));
    if(!missing)throw error;
  }
  if(state)return state;
  await initialize();
  return read();
}
