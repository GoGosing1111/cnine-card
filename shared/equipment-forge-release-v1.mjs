import {V3_JOINT_RELEASE_ENABLED} from './v3-joint-release-v1.mjs';
// Preparation only. Final activation requires a reviewed release document,
// a clean gated deployment, and the existing OWNER execution switch.
export const EQUIPMENT_FORGE_RELEASE_ENABLED=false;
export const FORGE_RUNTIME_RELEASE_ENABLED=V3_JOINT_RELEASE_ENABLED||EQUIPMENT_FORGE_RELEASE_ENABLED;
export const EQUIPMENT_FORGE_RELEASE_KEY='equipment_forge_release_20260922_v1';
