-- User-approved one-time policy application. Never enables forge or grants stock.
-- Run only after the coupon image/code release. All writes and audit are atomic.
DO $repair$
DECLARE
  operation_key CONSTANT text := 'ops:pingdu-repair-policy:20260922:v1';
  policy_key CONSTANT text := 'equipment_forge_runtime_policy_v1';
  previous_text text;
  previous_policy jsonb;
  next_policy jsonb;
  public_before text;
  audit_id bigint;
BEGIN
  IF current_database() <> 'cnine' THEN RAISE EXCEPTION 'WRONG_DATABASE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(operation_key));
  IF EXISTS(SELECT 1 FROM app_meta WHERE key=operation_key) THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=1 AND role='OWNER') THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  SELECT value INTO STRICT previous_text FROM app_meta WHERE key=policy_key FOR UPDATE;
  previous_policy := previous_text::jsonb;
  SELECT value INTO STRICT public_before FROM app_meta WHERE key='equipment_forge_public_settings_v1';
  IF previous_policy->>'mode' <> 'OFF'
     OR (previous_policy->>'revision')::integer <> 1
     OR previous_policy->'restoration' <> '{"enabled":false,"coinCost":null,"itemCode":null,"itemQuantity":null,"levelMode":"UNSET","expiresHours":null}'::jsonb
     OR public_before::jsonb->>'executionMode' <> 'OFF'
  THEN RAISE EXCEPTION 'POLICY_CHANGED_REVIEW_REQUIRED'; END IF;
  INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
  VALUES('PINGDU_REPAIR_COUPON','핑두 리페어 쿠폰','PINGDU REPAIR',
    '장비 강화로 파괴된 장비를 복구하는 전용 쿠폰입니다. 장비 강화 센터 → 파괴 기록에서 복구할 장비를 선택하세요. 쿠폰 소모 수량·반환 단계는 복구 화면에서 확인하며, 인벤토리에서 직접 사용하지 않습니다.',
    'MATERIAL','SPECIAL','assets/items/pingdu-repair-coupon-v1.webp',13,1)
  ON CONFLICT(code) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM inventory_items WHERE code='PINGDU_REPAIR_COUPON' AND name='핑두 리페어 쿠폰' AND category='MATERIAL' AND is_active=1 AND image_url='assets/items/pingdu-repair-coupon-v1.webp')
  THEN RAISE EXCEPTION 'COUPON_CATALOG_CONFLICT'; END IF;
  next_policy := jsonb_set(previous_policy,'{restoration}',
    (previous_policy->'restoration') || '{"coinCost":0,"itemCode":"PINGDU_REPAIR_COUPON","itemQuantity":1,"levelMode":"PREVIOUS","expiresHours":0}'::jsonb);
  next_policy := jsonb_set(next_policy,'{revision}',to_jsonb((previous_policy->>'revision')::integer+1));
  UPDATE app_meta SET value=next_policy::text,updated_at=CURRENT_TIMESTAMP WHERE key=policy_key AND value=previous_text;
  IF NOT FOUND THEN RAISE EXCEPTION 'POLICY_CAS_CONFLICT'; END IF;
  INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES(1,'PINGDU_REPAIR_POLICY','APP_META',policy_key,previous_text,
    jsonb_build_object('operationId',operation_key,'policy',next_policy,'publicSettingsUnchanged',true,'grantedQuantity',0)::text)
  RETURNING id INTO audit_id;
  INSERT INTO app_meta(key,value,updated_at) VALUES('pingdu_repair_catalog_20260922_v1','1',CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP;
  INSERT INTO app_meta(key,value,updated_at)
  VALUES(operation_key,jsonb_build_object('status','COMPLETED','beforePolicy',previous_policy,'afterPolicy',next_policy,'publicSettingsBefore',public_before::jsonb,'adminLogId',audit_id,'grantedQuantity',0)::text,CURRENT_TIMESTAMP);
END $repair$;
