// Check the authoritative account and verification on every auction request,
// before catalog reads, settlement ticks or writes. Never trust client flags or
// a cached session's account status for this entitlement.
export async function requireAuctionSecondVerification(env,user){
 const row=await env.DB.prepare(`SELECT u.status,u.banned_until,
  EXISTS(SELECT 1 FROM user_second_verifications v WHERE v.user_id=u.id) AS verified
  FROM users u WHERE u.id=?`).bind(user.id).first();
 if(!row||row.status!=='ACTIVE'||(row.banned_until&&Date.parse(String(row.banned_until).replace(' ','T').replace(/Z?$/,'Z'))>Date.now())){
  throw Object.assign(new Error('이용이 정지된 계정입니다.'),{code:'AUCTION_ACCOUNT',status:403});
 }
 if(!Number(row.verified))throw Object.assign(new Error('2차 인증을 완료해야 경매장을 이용할 수 있습니다. 메시지함에서 2차 인증을 진행해 주세요.'),{code:'AUCTION_SECOND_VERIFICATION_REQUIRED',status:403});
}

// A transfer is an additional entitlement, never a replacement mint receipt.
// Current holdings, the immutable paid settlement and the server-frozen source
// proof must agree. Switching off new hosting does not revoke prior purchases.
export async function readAuctionMercenaryOwners(env,code,userIds){
 const ids=[...new Set(userIds.map(Number))].filter(x=>Number.isSafeInteger(x)&&x>0);if(!ids.length)return new Set();
 const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('auction_user_policy_v1').first();if(!marker)return new Set();
 const rows=(await env.DB.prepare(`SELECT t.buyer_id,t.seller_id,t.ref,t.provenance_json,a.asset_json FROM auction_user_transfers_v1 t
 JOIN auction_user_lots_v1 a ON a.id=t.lot_id AND a.status='SOLD' AND a.winner_id=t.buyer_id AND a.seller_id=t.seller_id
 JOIN auction_user_settlements_v1 s ON s.lot_id=t.lot_id AND s.kind='SOLD' AND s.recipient_id=t.buyer_id AND s.asset_json=a.asset_json
 JOIN user_mercenary_cards_v1 h ON h.user_id=t.buyer_id AND h.mercenary_code=t.ref AND h.total_copies>0
 WHERE t.kind='MERCENARY' AND t.ref=? AND t.buyer_id IN (${ids.map(()=>'?').join(',')})`).bind(code,...ids).all()).results||[];
 const owners=new Set();for(const row of rows){const proof=JSON.parse(row.provenance_json),asset=JSON.parse(row.asset_json);
  if(proof.version===1&&proof.accessVerified===true&&proof.verifiedSellerId===Number(row.seller_id)&&proof.code===code&&JSON.stringify(asset.provenance)===row.provenance_json&&asset.kind==='MERCENARY'&&asset.ref===code&&asset.sourceKind!=='SYSTEM')owners.add(Number(row.buyer_id));
 }
 return owners;
}
