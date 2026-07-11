CREATE TABLE IF NOT EXISTS card_pack_cards (
  pack_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  PRIMARY KEY (pack_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_card_pack_cards_card
ON card_pack_cards(card_id);
