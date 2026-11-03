// Only cards emptied by auction escrow retain account growth on ordinary
// re-acquisition. Existing non-auction zero-quantity reset behavior is unchanged.
export const AUCTION_GROWTH_TRIGGER_SQL=`
CREATE OR REPLACE FUNCTION cnine_auction_card_growth_v1() RETURNS trigger LANGUAGE plpgsql AS $auction$
BEGIN
 IF OLD.quantity=0 AND NEW.quantity>0 AND EXISTS(SELECT 1 FROM auction_user_card_growth_v1 WHERE user_id=OLD.user_id AND card_id=OLD.card_id::text) THEN
  NEW.breakthrough_level:=OLD.breakthrough_level;
  NEW.breakthrough_fail_count:=OLD.breakthrough_fail_count;
  DELETE FROM auction_user_card_growth_v1 WHERE user_id=OLD.user_id AND card_id=OLD.card_id::text;
 END IF;
 RETURN NEW;
END $auction$;
DROP TRIGGER IF EXISTS cnine_auction_card_growth_v1 ON user_cards;
CREATE TRIGGER cnine_auction_card_growth_v1 BEFORE UPDATE ON user_cards FOR EACH ROW EXECUTE FUNCTION cnine_auction_card_growth_v1();
`;
