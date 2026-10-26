package dev.pages.cnine_card.twa;
import java.nio.file.*;
import java.util.*;
import org.json.*;
public final class StoreDistributionTest {
 public static void main(String[] args)throws Exception{
  int checks=0;
  for(String path:new String[]{"/api/server-support/apply","/api/server-support/package/apply","/api/admin/server-support/package","/api/coin-prediction/join","/api/prison-camp/release","/api/prison-death-game/bite","/api/%73erver-support/info","/admin/","/js/server-support-v1.mjs"}){if(!DistributionPolicy.blocked(ClientPolicy.ORIGIN+path))throw new AssertionError(path);checks++;}
  for(String path:new String[]{"/api/me","/api/messages","/api/pets/state","/api/prison/status","/assets/items/sss-limited-shard-20261020/item.webp"}){if(DistributionPolicy.blocked(ClientPolicy.ORIGIN+path))throw new AssertionError(path);checks++;}
  String local=Files.readString(Path.of(args[0])),remote=Files.readString(Path.of(args[1]));
  DistributionPolicy policy=new DistributionPolicy(local);ClientPolicy.Manifest merged=ClientPolicy.parseManifest(policy.mergeManifest(remote));
  for(String path:merged.files.keySet())if(DistributionPolicy.excludedAsset(path))throw new AssertionError(path);checks++;
  JSONArray overrides=new JSONObject(local).getJSONArray("files");
  for(int i=0;i<overrides.length();i++){JSONObject row=overrides.getJSONObject(i);ClientPolicy.Entry e=merged.files.get(row.getString("path"));if(e==null||!e.sha256.equals(row.getString("sha256"))||!e.essential)throw new AssertionError(row.toString());checks++;}
  if(!"onestore/index.html".equals(policy.bundledPath(ClientPolicy.ORIGIN+"/?source=android")))throw new AssertionError("index route");checks++;
  if(policy.bundledPath(ClientPolicy.ORIGIN+"/api/messages")!=null)throw new AssertionError("private API cached");checks++;
  Path base=Path.of(args[0]).getParent().getParent(),cache=Files.createTempDirectory("onestore-resources-qa-");
  ResourceStore store=new ResourceStore(cache.toFile(),url->{String path=policy.bundledPath(url);if(path==null)throw new AssertionError("Network access in bundled check");return Files.newInputStream(base.resolve(path));});
  for(int i=0;i<overrides.length();i++){ClientPolicy.Entry e=merged.files.get(overrides.getJSONObject(i).getString("path"));store.ensure(e,merged.releaseId,null);if(!store.has(e))throw new AssertionError(e.path);checks++;}
  if(!cache.toRealPath().startsWith(Path.of(System.getProperty("java.io.tmpdir")).toRealPath())||!cache.getFileName().toString().startsWith("onestore-resources-qa-"))throw new AssertionError("Unsafe QA cleanup");
  try(var paths=Files.walk(cache)){paths.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.delete(p);}catch(Exception e){throw new RuntimeException(e);}});}
  System.out.println("Store native policy: "+checks+" checks passed; no account or server writes.");
 }
}
