import {seasonAwardStatements as seasonStatements} from './_season_s1.js';
import {hideoutAwardStatements} from './_personal_hideout.js';

// Both progression systems participate in the content's existing atomic claim.
export async function contentProgressionStatements(env,event,options={}){
 const season=await seasonStatements(env,event,options),hideout=hideoutAwardStatements(env,event,options);
 const writes=[...season,...hideout];
 writes.award=season.award;writes.hideoutAward=hideout.hideoutAward;
 return writes;
}
