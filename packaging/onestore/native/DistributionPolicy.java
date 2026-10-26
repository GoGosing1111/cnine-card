package dev.pages.cnine_card.twa;

import java.net.URI;
import java.net.URLDecoder;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

/** APK-local policy. It has no database client and never changes live records. */
public final class DistributionPolicy {
    private final JSONArray overrides;
    private final Set<String> localPaths = new HashSet<>();
    private final String fingerprint;
    public DistributionPolicy(String raw) throws Exception {
        JSONObject root = new JSONObject(raw);
        overrides = root.getJSONArray("files");
        fingerprint = ResourceStore.hex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes("UTF-8")));
        for(int i=0;i<overrides.length();i++) {
            String path=overrides.getJSONObject(i).getString("path");
            if(!ClientPolicy.safePath(path)||!localPaths.add(path))throw new Exception("Invalid bundled resource");
        }
        if(!localPaths.contains("/index.html")||!localPaths.contains("/js/store-distribution-v1.js"))throw new Exception("Missing store runtime");
    }
    public static boolean excludedAsset(String path) {
        return path.matches("(?i).*(?:^|/)(?:coin-prediction|clan-prison-camp|prison-death-game|server-support|support-package|supporter-(?:application|season-pass|screen-guard)|season-pass)(?:[-/.]|$).*");
    }
    public static boolean blocked(String value) {
        if(!ClientPolicy.gameUrl(value))return false;
        try {
            String path=URLDecoder.decode(new URI(value).getRawPath().replace("+","%2B"),"UTF-8").replaceAll("/+","/");
            return excludedAsset(path)||path.matches("(?i)^/(?:admin(?:/.*)?|api/(?:admin(?:/.*)?|(?:coin-prediction|prison-camp|prison-death-game|server-support|support-package|supporter-season-pass)(?:/.*)?))$");
        }catch(Exception e){return true;}
    }
    public String bundledPath(String value) {
        String path=ClientPolicy.resourcePath(value,"GET");
        return localPaths.contains(path)?"onestore"+path:null;
    }
    public String mergeManifest(String raw) throws Exception {
        ClientPolicy.parseManifest(raw); // Validate the original transport first.
        JSONObject root=new JSONObject(raw);JSONArray files=root.getJSONArray("files"),selected=new JSONArray();
        for(int i=0;i<files.length();i++){
            JSONObject row=files.getJSONObject(i);String path=row.getString("path");
            if(!excludedAsset(path)&&!localPaths.contains(path))selected.put(row);
        }
        for(int i=0;i<overrides.length();i++)selected.put(overrides.getJSONObject(i));
        String release=ResourceStore.hex(MessageDigest.getInstance("SHA-256").digest((root.getString("releaseId")+fingerprint).getBytes("UTF-8")));
        root.put("files",selected);root.put("releaseId",release);
        String merged=root.toString();ClientPolicy.parseManifest(merged);return merged;
    }
}
