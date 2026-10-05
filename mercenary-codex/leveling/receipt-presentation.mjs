// Acknowledgement follows both a fresh account read and explicit completion of
// the reveal. Navigation or a rendering failure leaves the receipt recoverable.
export async function presentLevelReceipt({receipt, client, account, present}) {
  if (!receipt || receipt.status !== 'COMPLETED') return {completed:false, pending:Boolean(client.pending())};
  const fresh = await client.state();
  const card = fresh.cards.find(c => c.code === receipt.mercenaryCode) || account.cards.find(c => c.code === receipt.mercenaryCode);
  const seen = await present(receipt.result, receipt.action, card);
  if (seen === true) client.acknowledge(receipt.requestId);
  return {completed:true, account:fresh, selected:receipt.mercenaryCode, pending:Boolean(client.pending())};
}
