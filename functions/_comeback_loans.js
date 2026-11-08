// Temporary combat access is separate from permanent copies used by the market, fusion and growth.
export const LOAN_PREFIX = 'comeback26:loan:';
export const LOAN_CODES = Object.freeze(['V-058', 'V-977']);
const codes = LOAN_CODES.map(code => "'" + code + "'").join(',');
const active = `SELECT CAST(SUBSTR(a.key,${LOAN_PREFIX.length+1}) AS BIGINT) AS user_id,
  k.code AS mercenary_code,a.value AS loan_until FROM app_meta a
  CROSS JOIN (SELECT 'V-058' AS code UNION ALL SELECT 'V-977') k
  WHERE a.key>='${LOAN_PREFIX}' AND a.key<'comeback26:loan;' AND a.value>CURRENT_TIMESTAMP`;

function playableRows(withCounts) {
  return `(SELECT c.user_id,c.mercenary_code,c.total_copies${withCounts?',c.duplicate_count':''},a.value AS loan_until
    FROM user_mercenary_cards_v1 c LEFT JOIN app_meta a
      ON c.mercenary_code IN (${codes}) AND a.key=('${LOAN_PREFIX}'||CAST(c.user_id AS TEXT)) AND a.value>CURRENT_TIMESTAMP
    WHERE c.total_copies>0
    UNION ALL SELECT b.user_id,b.mercenary_code,1${withCounts?',0':''},b.loan_until FROM (${active}) b
    WHERE NOT EXISTS (SELECT 1 FROM user_mercenary_cards_v1 p WHERE p.user_id=b.user_id AND p.mercenary_code=b.mercenary_code AND p.total_copies>0))`;
}

export const PLAYABLE_MERCENARIES = playableRows(false);
export const PLAYABLE_MERCENARY_COUNTS = playableRows(true);

// The permanent Lv.21 checkpoint is stored as level 20 with all four breakthrough bits.
export const PLAYABLE_LEVELS = `(SELECT p.user_id,p.mercenary_code,p.level,p.experience,p.breakthrough_mask,p.revision,NULL AS loan_until
  FROM user_mercenary_levels_v1 p WHERE NOT EXISTS (SELECT 1 FROM app_meta a
    WHERE p.mercenary_code IN (${codes}) AND a.key=('${LOAN_PREFIX}'||CAST(p.user_id AS TEXT)) AND a.value>CURRENT_TIMESTAMP)
  UNION ALL SELECT b.user_id,b.mercenary_code,20,0,15,0,b.loan_until FROM (${active}) b)`;
