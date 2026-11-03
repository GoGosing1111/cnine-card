import {readPackageCoinAccounting,packageCoinGuardStatements} from './_package_coin_accounting.js';
// The existing restricted balance follows the winning payment to the seller.
// Original package purchase/issue receipts are never rewritten.
export async function auctionSettlementAccounting(env,lot,winner,money){
 if(!winner)return {statements:[],reason:''};
 const buyer=await readPackageCoinAccounting(env,Number(winner.user_id)),key='U'+lot.id;
 const restricted=BigInt(buyer.state.auctionReserved[key]||0),net=restricted-restricted*20n/100n;
 delete buyer.state.auctionReserved[key];
 const statements=packageCoinGuardStatements(env,Number(winner.user_id),buyer),system=JSON.parse(lot.asset_json).sourceKind==='SYSTEM';
 const restrictedNet=system?0n:net>BigInt(money.net)?BigInt(money.net):net;
 if(restrictedNet>0n){
  const seller=await readPackageCoinAccounting(env,Number(lot.seller_id));
  // Start a ledger for sellers who have never purchased a package. The exact
  // restricted amount is reconciled from the credit log once, like other logs.
  seller.tracked=true;statements.push(...packageCoinGuardStatements(env,Number(lot.seller_id),seller));
 }
 return {statements,reason:`유저 경매 U${lot.id} 판매 정산 (수수료 20%; 패키지 코인 ${restrictedNet})`};
}
