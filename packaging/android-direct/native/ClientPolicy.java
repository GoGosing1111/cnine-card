package dev.pages.cnine_card.twa;

import java.net.URI;
import java.net.URLDecoder;
import java.util.*;
import org.json.*;

/** Shared by the native client and the JVM regression harness. No account data belongs here. */
public final class ClientPolicy {
    public static final String ORIGIN = "https://cnine-card.pages.dev";
    public static final String MANIFEST_URL = ORIGIN + "/client/windows/manifest.json";
    public static final String UPDATE_URL = "https://raw.githubusercontent.com/GoGosing1111/cnine-card/main/packaging/android-direct/latest.json";
    public static final String PACKAGE = "dev.pages.cnine_card.twa";
    public static final String SIGNER = "1a164dea3a2be5f9fa53ae107ed0b75e5ea56586237bddf273e476286c241e15";
    public static final long MAX_FILE = 512L * 1024 * 1024;
    public static final long CACHE_BUDGET = 768L * 1024 * 1024;
    public static final int MAX_MANIFEST = 12 * 1024 * 1024;
    private static final Set<String> ROOTS = new HashSet<>(Arrays.asList("assets","css","data","equipment-forge","equipment-polish","events","js","loot-shop","master-star-mine","mercenary-codex","mercenary-hangar","miracle-cube","organization","pet-codex","pets","preview","pve-v3","pve","raid","shared","ui"));
    private static final Set<String> ROOT_FILES = new HashSet<>(Arrays.asList("index.html","offline.html","manifest.webmanifest","style.css","app.js"));
    public static String mime(String path) {
        String ext=path.substring(path.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        switch(ext){
            case "html": return "text/html"; case "js": case "mjs": return "text/javascript";
            case "css": return "text/css"; case "json": return "application/json";
            case "webmanifest": return "application/manifest+json"; case "wasm": return "application/wasm";
            case "png": return "image/png"; case "jpg": case "jpeg": return "image/jpeg";
            case "webp": case "avif": case "gif": return "image/"+ext; case "svg": return "image/svg+xml";
            case "woff": case "woff2": case "ttf": case "otf": return "font/"+ext;
            case "mp3": return "audio/mpeg"; case "ogg": return "audio/ogg"; case "wav": return "audio/wav";
            case "mp4": return "video/mp4"; case "webm": return "video/webm"; default:return null;
        }
    }
    public static boolean safePath(String path) {
        if(path==null || !path.startsWith("/") || path.matches(".*[\\\\?#%\\x00-\\x1f].*"))return false;
        String[] parts=path.substring(1).split("/",-1);
        for(String p:parts)if(p.isEmpty()||p.startsWith("."))return false;
        return (ROOTS.contains(parts[0])||ROOT_FILES.contains(path.substring(1)))&&mime(path)!=null;
    }
    public static boolean gameUrl(String value) {
        try{URI u=new URI(value);return "https".equals(u.getScheme())&&"cnine-card.pages.dev".equals(u.getHost())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443);}catch(Exception e){return false;}
    }
    public static String resourcePath(String url,String method) {
        if(!("GET".equals(method)||"HEAD".equals(method))||!gameUrl(url))return null;
        try{
            String path=URLDecoder.decode(new URI(url).getRawPath().replace("+","%2B"),"UTF-8");
            if(path.equals("/"))path="/index.html"; else if(path.endsWith("/"))path+="index.html";
            return safePath(path)?path:null;
        }catch(Exception e){return null;}
    }
    public static final class Entry {
        public final String path,sha256,type; public final long bytes; public final boolean essential;
        public Entry(String path,String hash,long bytes,boolean essential){this.path=path;this.sha256=hash;this.bytes=bytes;this.essential=essential;this.type=mime(path);}
    }
    public static final class Manifest {
        public final String releaseId,raw; public final Map<String,Entry> files;
        Manifest(String releaseId,String raw,Map<String,Entry> files){this.releaseId=releaseId;this.raw=raw;this.files=Collections.unmodifiableMap(files);}
    }
    public static Manifest parseManifest(String raw) throws Exception {
        JSONObject root=new JSONObject(raw);
        if(root.getInt("schema")!=1||!ORIGIN.equals(root.getString("origin"))||!root.getString("releaseId").matches("[a-f0-9]{16,64}"))throw new Exception("게임 파일 목록 형식이 올바르지 않습니다.");
        JSONArray rows=root.getJSONArray("files");if(rows.length()<1||rows.length()>25000)throw new Exception("게임 파일 목록 크기 오류");
        Map<String,Entry> entries=new LinkedHashMap<>();
        for(int i=0;i<rows.length();i++){
            JSONObject r=rows.getJSONObject(i);String path=r.getString("path"),hash=r.getString("sha256");long size=r.getLong("bytes");
            if(!safePath(path)||entries.containsKey(path)||!hash.matches("[a-f0-9]{64}")||size<0||size>MAX_FILE||!(r.get("essential") instanceof Boolean)||r.getDouble("bytes")!=size)throw new Exception("허용되지 않은 게임 파일 정보");
            entries.put(path,new Entry(path,hash,size,r.getBoolean("essential")));
        }
        Entry index=entries.get("/index.html");if(index==null||!index.essential)throw new Exception("게임 시작 파일이 없습니다.");
        // This is the Windows transport's schema, not its executable version policy.
        // Android executable minimums belong to the separate Android update feed.
        return new Manifest(root.getString("releaseId"),raw,entries);
    }
    public static final class Update {
        public final int code; public final String version,url,sha256; public final long bytes;
        Update(int code,String version,String url,String hash,long bytes){this.code=code;this.version=version;this.url=url;this.sha256=hash;this.bytes=bytes;}
    }
    public static Update parseUpdate(String raw,int installed) throws Exception {
        JSONObject r=new JSONObject(raw);String version=r.getString("version"),hash=r.getString("sha256"),url=r.getString("url");long bytes=r.getLong("bytes");int code=r.getInt("versionCode");
        if(r.getInt("schema")!=1||!PACKAGE.equals(r.getString("packageId"))||!SIGNER.equals(r.getString("signerSha256").replace(":","").toLowerCase(Locale.ROOT))||!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")||!hash.matches("[a-f0-9]{64}")||bytes<1||bytes>64*1024*1024||r.getDouble("bytes")!=bytes||code<1||r.getDouble("versionCode")!=code)throw new Exception("앱 업데이트 정보가 올바르지 않습니다.");
        String expected="https://github.com/GoGosing1111/cnine-card/releases/download/android-v"+version+"/ReverseCall-Android-"+version+".apk";
        if(!expected.equals(url))throw new Exception("앱 업데이트 주소가 올바르지 않습니다.");
        return code>installed?new Update(code,version,url,hash,bytes):null;
    }
    public static boolean downloadHost(String url,boolean apk) {
        if(!apk)return gameUrl(url);
        try{URI u=new URI(url);String h=u.getHost();return "https".equals(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)&&("github.com".equals(h)||"release-assets.githubusercontent.com".equals(h)||"objects.githubusercontent.com".equals(h));}catch(Exception e){return false;}
    }
    /** Inclusive byte interval; null means an invalid range. */
    public static long[] range(String range,long length) {
        if(range==null)return new long[]{0,length-1};
        if(!range.matches("bytes=[0-9]*-[0-9]*"))return null;
        try{String[] v=range.substring(6).split("-",-1);if(v[0].isEmpty()&&v[1].isEmpty())return null;
            long a=v[0].isEmpty()?Math.max(0,length-Long.parseLong(v[1])):Long.parseLong(v[0]);
            long b=v[0].isEmpty()||v[1].isEmpty()?length-1:Math.min(length-1,Long.parseLong(v[1]));
            return a<0||a>=length||a>b?null:new long[]{a,b};
        }catch(Exception e){return null;}
    }
}
