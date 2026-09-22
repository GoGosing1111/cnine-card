import {V3_JOINT_RELEASE_ENABLED} from './v3-joint-release-v1.mjs';
// 2026-09-22: explicit user ON approval. The immutable release document and
// OWNER execution switch remain mandatory; unrelated V3 gates stay unchanged.
export const EQUIPMENT_FORGE_RELEASE_ENABLED=true;
export const FORGE_RUNTIME_RELEASE_ENABLED=V3_JOINT_RELEASE_ENABLED||EQUIPMENT_FORGE_RELEASE_ENABLED;
export const EQUIPMENT_FORGE_RELEASE_KEY='equipment_forge_release_20260922_v1';
