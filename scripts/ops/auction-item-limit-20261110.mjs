import {auctionRegistrationFields} from '../../functions/_auction_user_service.js';
import {AUCTION_ITEM_LISTING_LIMIT,AUCTION_LISTING_WINDOW_MS} from '../../shared/auction-user-policy-v1.mjs';

const {kind,ref}=auctionRegistrationFields('postgres');
// Older releases already lock the auction clock when registering. This also covers writers during a rolling deployment.
export const AUCTION_ITEM_GUARD_SQL=`
CREATE FUNCTION public.cnine_auction_item_limit_v1() RETURNS trigger LANGUAGE plpgsql AS $auction_limit$
DECLARE
  asset jsonb := NEW.asset_json::jsonb;
  item_kind text := asset ->> 'kind';
  item_ref text := COALESCE(asset ->> 'policyRef',asset -> 'instance' ->> 'equipment_id',asset ->> 'ref');
BEGIN
  PERFORM id FROM public.auction_user_clock_v1 WHERE id=1 FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.auction_user_lots_v1
    WHERE ${kind}=item_kind AND ${ref}=item_ref AND created_ms>NEW.created_ms-${AUCTION_LISTING_WINDOW_MS}
    ORDER BY created_ms DESC LIMIT 1 OFFSET ${AUCTION_ITEM_LISTING_LIMIT-1}
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='AUCTION_ITEM_LIMIT constraint: 동일 물품의 최근 24시간 등록 한도에 도달했습니다.';
  END IF;
  RETURN NEW;
END $auction_limit$;
CREATE TRIGGER cnine_auction_item_limit_v1 BEFORE INSERT ON public.auction_user_lots_v1
FOR EACH ROW EXECUTE FUNCTION public.cnine_auction_item_limit_v1();
`;
