import {retiredContentResponse} from './_retired_content.js';
export async function handleIdleV3Ready({path,deps}){
  return retiredContentResponse(path,deps.json);
}
