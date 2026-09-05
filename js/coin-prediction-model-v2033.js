(() => {
  'use strict';
  const categories = Object.freeze([
    { code: 'SOCCER', label: '축구', icon: 'soccer' },
    { code: 'BASEBALL', label: '야구', icon: 'baseball' },
    { code: 'BASKETBALL', label: '농구', icon: 'basketball' },
    { code: 'LOL', label: 'LOL', icon: 'lol' },
    { code: 'SETKA', label: '세트카', icon: 'setka' },
    { code: 'OTHER', label: '기타', icon: 'other' }
  ]);
  const category = code => categories.find(item => item.code === code) || categories[5];
  const amount = value => Math.max(0, Number(value) || 0);

  // Display-only: mirrors settle()'s two Math.floor operations, including subsidy.
  // Never submit this estimate as a payout or replace the authoritative settlement.
  function estimate(event, optionId, added = 0) {
    const option = event?.options?.find(item => Number(item.id) === Number(optionId));
    const mine = event?.myBet;
    const stake = Number(mine?.option_id) === Number(optionId) ? amount(mine.amount) : 0;
    const extra = Number.isSafeInteger(Number(added)) ? amount(added) : 0;
    if (!option || (mine && Number(mine.option_id) !== Number(optionId))) return null;
    const pool = amount(event.total_pool) + extra;
    const optionPool = amount(option.total_bet) + extra;
    const totalStake = stake + extra;
    const fee = Number(event.fee_percent || 10);
    const support = amount(event.treasury_subsidy);
    const distributable = Math.floor(pool * (100 - fee) / 100) + support;
    const odds = optionPool > 0 ? distributable / optionPool : null;
    const payout = optionPool > 0 && totalStake > 0 ? Math.floor(distributable * totalStake / optionPool) : null;
    return { odds, payout, profit: payout === null ? null : payout - totalStake, stake: totalStake, extra, pool, optionPool, support, fee };
  }

  function outcome(event) {
    const mine = event?.myBet;
    if (!mine) return null;
    const stake = amount(mine.amount);
    if (mine.status === 'SETTLED' || mine.status === 'REFUNDED') {
      const payout = amount(mine.payout);
      return { ...estimate(event, mine.option_id), stake, payout, profit: payout - stake,
        final: true, refunded: mine.status === 'REFUNDED', won: mine.status === 'SETTLED' && payout > 0 };
    }
    return { ...estimate(event, mine.option_id), final: false, refunded: false, won: false };
  }

  window.CoinPredictionModel = Object.freeze({ categories, category, estimate, outcome });
})();
