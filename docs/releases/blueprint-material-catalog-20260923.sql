-- User request: register both approved blueprint images as materials for later use.
-- One-time metadata operation; never grants inventory, creates recipes or edits pools.
DO $blueprints$
DECLARE
  operation_key CONSTANT text := 'ops:blueprint-material-catalog:20260923:v1';
  desired CONSTANT jsonb := '[
    {"code":"EASTERN_ARMS_WEAPON_BLUEPRINT","name":"동방무기상 무기설계도","subtitle":"WEAPON BLUEPRINT","description":"동방무기상 무기 제작을 위한 설계도입니다. 추후 제작 재료로 사용됩니다.","image_url":"assets/items/eastern-arms-weapon-blueprint-v1.png","sort_order":215001},
    {"code":"MAYBACH_VISION6_BLUEPRINT","name":"마이바흐 비전 6 차량설계도","subtitle":"VEHICLE BLUEPRINT","description":"마이바흐 비전 6 차량 제작을 위한 설계도입니다. 추후 제작 재료로 사용됩니다.","image_url":"assets/items/maybach-vision6-blueprint-v1.png","sort_order":215002}
  ]'::jsonb;
  owner_id bigint;
  audit_id bigint;
  inserted_count integer;
  matched_count integer;
  previous_catalog jsonb;
  registered_catalog jsonb;
  prior_receipt text;
BEGIN
  IF current_database() <> 'cnine' THEN RAISE EXCEPTION 'WRONG_DATABASE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(operation_key));
  SELECT value INTO prior_receipt FROM app_meta WHERE key=operation_key FOR UPDATE;
  IF FOUND THEN
    IF prior_receipt::jsonb->>'status' IS DISTINCT FROM 'COMPLETED' THEN RAISE EXCEPTION 'INVALID_OPERATION_RECEIPT'; END IF;
    RETURN;
  END IF;
  SELECT id INTO owner_id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR UPDATE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_OWNER_REQUIRED'; END IF;
  IF EXISTS(
    SELECT 1 FROM inventory_items i
    JOIN jsonb_to_recordset(desired) AS x(code text,name text) ON i.name=x.name
    WHERE i.code<>x.code
  ) THEN RAISE EXCEPTION 'BLUEPRINT_NAME_CONFLICT'; END IF;
  PERFORM i.code FROM inventory_items i
    WHERE i.code IN (SELECT x.code FROM jsonb_to_recordset(desired) AS x(code text))
    ORDER BY i.code FOR UPDATE;
  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.code),'[]'::jsonb) INTO previous_catalog
    FROM inventory_items i WHERE i.code IN (SELECT x.code FROM jsonb_to_recordset(desired) AS x(code text));
  INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
    SELECT x.code,x.name,x.subtitle,x.description,'MATERIAL','SPECIAL',x.image_url,x.sort_order,1
    FROM jsonb_to_recordset(desired) AS x(code text,name text,subtitle text,description text,image_url text,sort_order bigint)
    ON CONFLICT(code) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT COUNT(*) INTO matched_count
    FROM inventory_items i
    JOIN jsonb_to_recordset(desired) AS x(code text,name text,subtitle text,description text,image_url text,sort_order bigint)
      ON i.code=x.code
    WHERE i.name=x.name AND i.subtitle=x.subtitle AND i.description=x.description
      AND i.category='MATERIAL' AND i.rarity='SPECIAL' AND i.is_active=1
      AND i.image_url=x.image_url AND i.sort_order=x.sort_order;
  IF matched_count<>2 THEN RAISE EXCEPTION 'BLUEPRINT_CATALOG_CONFLICT'; END IF;
  SELECT jsonb_agg(to_jsonb(i) ORDER BY i.code) INTO registered_catalog
    FROM inventory_items i WHERE i.code IN (SELECT x.code FROM jsonb_to_recordset(desired) AS x(code text));
  INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES(owner_id,'BLUEPRINT_MATERIAL_REGISTER','INVENTORY_ITEM',operation_key,
      jsonb_build_object('operationId',operation_key,'catalog',previous_catalog)::text,
      jsonb_build_object('operationId',operation_key,'actor','SYSTEM_OPS','catalog',registered_catalog,
        'insertedRows',inserted_count,'grantedQuantity',0,'recipesCreated',0)::text)
    RETURNING id INTO audit_id;
  INSERT INTO app_meta(key,value,updated_at)
    VALUES(operation_key,jsonb_build_object('status','COMPLETED','completedAt',CURRENT_TIMESTAMP,
      'catalog',registered_catalog,'adminLogId',audit_id,'insertedRows',inserted_count,
      'grantedQuantity',0,'recipesCreated',0)::text,CURRENT_TIMESTAMP);
END $blueprints$;
