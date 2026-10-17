package dev.pages.cnine_card.twa;

import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.json.*;

public final class ClientCoreTest {
    private static int checks;
    private static void check(boolean value,String name){if(!value)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    private static void rejects(RunnableWithException run,String name)throws Exception{try{run.run();throw new AssertionError("Did not reject: "+name);}catch(AssertionError e){throw e;}catch(Exception expected){check(true,name);}}
    interface RunnableWithException{void run()throws Exception;}
    static String hash(byte[] bytes)throws Exception{return ResourceStore.hex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    static JSONObject entry(String path,byte[] bytes,boolean essential)throws Exception{return new JSONObject().put("path",path).put("sha256",hash(bytes)).put("bytes",bytes.length).put("essential",essential);}
    static String manifest(String release,JSONObject...rows){return new JSONObject().put("schema",1).put("origin",ClientPolicy.ORIGIN).put("releaseId",release).put("files",new JSONArray(Arrays.asList(rows))).toString();}
    public static void main(String[] args)throws Exception{
        File root=new File(args[0]);Files.createDirectories(root.toPath());
        byte[] index="<html>Native fixture</html>".getBytes("UTF-8"),css="color: white".getBytes("UTF-8"),nextCss="color: black".getBytes("UTF-8"),image=new byte[]{4,5,6,7};
        Map<String,byte[]> server=new java.util.concurrent.ConcurrentHashMap<>();server.put("/index.html",index);server.put("/css/game.css",css);server.put("/assets/unit.png",image);AtomicLong requests=new AtomicLong();
        ResourceStore store=new ResourceStore(Files.createTempDirectory(root.toPath(),"fixture-").toFile(),url->{requests.incrementAndGet();byte[] b=server.get(new URI(url).getPath());if(b==null)throw new IOException("404");return new ByteArrayInputStream(b);});
        ClientPolicy.Manifest first=ClientPolicy.parseManifest(manifest("1111111111111111",entry("/index.html",index,true),entry("/css/game.css",css,true),entry("/assets/unit.png",image,false)));
        store.prepare(first,(a,b,c,d,e,f)->{});check(requests.get()==2,"initial preparation downloads only essential files");check(store.active().releaseId.equals(first.releaseId),"complete manifest activated");
        store.prepare(first,(a,b,c,d,e,f)->{});check(requests.get()==2,"second launch reuses verified files with zero network downloads");
        store.ensure(first.files.get("/assets/unit.png"),first.releaseId,null);store.ensure(first.files.get("/assets/unit.png"),first.releaseId,null);check(requests.get()==3,"optional image persists and is reused");
        File corrupted=store.file(hash(css));long previousTime=corrupted.lastModified();Files.write(corrupted.toPath(),"XXXXXXXXXXXX".getBytes("UTF-8"));corrupted.setLastModified(previousTime);
        store.prepare(first,(a,b,c,d,e,f)->{});check(requests.get()==4&&ResourceStore.hash(corrupted).equals(hash(css)),"same-length and same-time corruption is repaired");
        server.put("/css/game.css",nextCss);ClientPolicy.Manifest next=ClientPolicy.parseManifest(manifest("2222222222222222",entry("/index.html",index,true),entry("/css/game.css",nextCss,true)));
        store.prepare(next,(a,b,c,d,e,f)->{});check(requests.get()==5&&store.active().releaseId.equals(next.releaseId),"new release downloads only the changed file");
        ClientPolicy.Manifest broken=ClientPolicy.parseManifest(manifest("3333333333333333",entry("/index.html",index,true),entry("/css/game.css","unexpected".getBytes("UTF-8"),true)));
        rejects(()->store.prepare(broken,(a,b,c,d,e,f)->{}),"wrong remote bytes rejected");check(store.active().releaseId.equals(next.releaseId)&&store.complete(next),"failed update preserves previous complete version");
        rejects(()->ClientPolicy.parseManifest(manifest("1111111111111111",entry("/index.html",index,true),entry("/api/account.json",image,false))),"API response excluded from persistent files");
        rejects(()->ClientPolicy.parseManifest(manifest("1111111111111111",entry("/index.html",index,true),entry("/assets/../secret.json",image,false))),"path traversal rejected");
        rejects(()->ClientPolicy.parseManifest(manifest("1111111111111111",entry("/index.html",index,true),entry("/index.html",index,true))),"duplicate manifest path rejected");
        check(ClientPolicy.resourcePath(ClientPolicy.ORIGIN+"/api/me","GET")==null&&ClientPolicy.resourcePath(ClientPolicy.ORIGIN+"/index.html","POST")==null,"API and POST bypass resource storage");
        check(ClientPolicy.resourcePath("https://evil.example/index.html","GET")==null&&ClientPolicy.resourcePath(ClientPolicy.ORIGIN+"/assets/%2e%2e/secret.json","GET")==null,"foreign and encoded traversal requests rejected");
        check(Arrays.equals(ClientPolicy.range("bytes=2-4",10),new long[]{2,4})&&Arrays.equals(ClientPolicy.range("bytes=-3",10),new long[]{7,9})&&ClientPolicy.range("bytes=10-",10)==null&&ClientPolicy.range("bytes=0-1,4-5",10)==null,"cached audio/video ranges bounded correctly");
        JSONObject update=new JSONObject().put("schema",1).put("packageId",ClientPolicy.PACKAGE).put("version","1.1.1").put("versionCode",4).put("url","https://github.com/GoGosing1111/cnine-card/releases/download/android-v1.1.1/ReverseCall-Android-1.1.1.apk").put("bytes",100).put("sha256",hash(image)).put("signerSha256",ClientPolicy.SIGNER);
        check(ClientPolicy.parseUpdate(update.toString(),3)!=null&&ClientPolicy.parseUpdate(update.toString(),4)==null&&ClientPolicy.parseUpdate(update.toString(),5)==null,"only newer APK versions can update");
        rejects(()->ClientPolicy.parseUpdate(new JSONObject(update.toString()).put("url","https://evil.example/update.apk").toString(),3),"untrusted APK URL rejected");
        rejects(()->ClientPolicy.parseUpdate(new JSONObject(update.toString()).put("signerSha256",hash(index)).toString(),3),"different APK signing identity rejected");
        rejects(()->ClientPolicy.parseUpdate(new JSONObject(update.toString()).put("packageId","other.app").toString(),3),"different APK package rejected");
        check(!ClientPolicy.downloadHost("http://github.com/a.apk",true)&&!ClientPolicy.downloadHost("https://github.com.evil.example/a.apk",true)&&!ClientPolicy.downloadHost("https://github.com@evil.example/a.apk",true),"APK redirect downgrade and host confusion rejected");
        if(args.length>1&&args[1].equals("--live")){
            ClientPolicy.Manifest live=ClientPolicy.parseManifest(ClientHttp.text(ClientPolicy.MANIFEST_URL,ClientPolicy.MAX_MANIFEST,false));
            ResourceStore liveStore=new ResourceStore(new File(root,"live"),url->ClientHttp.open(url,false,false));
            long began=System.currentTimeMillis();AtomicLong last=new AtomicLong();
            liveStore.prepare(live,(done,count,checked,total,downloaded,needed)->{long now=System.currentTimeMillis();if(now-last.get()>5000||done==count){last.set(now);System.out.println("LIVE "+done+"/"+count+" downloaded="+downloaded+" needed="+needed);}});
            long downloaded=liveStore.downloads.get();liveStore.prepare(live,(a,b,c,d,e,f)->{});
            check(liveStore.downloads.get()==downloaded,"actual production release second preparation makes zero downloads");
            System.out.println("LIVE_RESULT "+new JSONObject().put("releaseId",live.releaseId).put("downloadedFiles",downloaded).put("cacheHits",liveStore.hits.get()).put("milliseconds",System.currentTimeMillis()-began));
        }
        System.out.println("RESULT "+new JSONObject().put("passed",true).put("assertions",checks));
    }
}
