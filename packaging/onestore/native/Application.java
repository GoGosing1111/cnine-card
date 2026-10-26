package dev.pages.cnine_card.twa;

import java.io.*;

public class Application extends android.app.Application {
    private ResourceStore store;private DistributionPolicy policy;
    public volatile ClientPolicy.Manifest session;
    public volatile boolean playing;
    private String assetText(String name)throws IOException{
        try(InputStream in=getAssets().open(name);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");
        }
    }
    public synchronized DistributionPolicy policy()throws Exception{
        if(policy==null)policy=new DistributionPolicy(assetText("onestore/manifest.json"));return policy;
    }
    public synchronized ResourceStore store()throws IOException{
        if(store==null){
            try{policy();}catch(Exception e){throw new IOException("앱 구성 확인에 실패했습니다.",e);}
            store=new ResourceStore(new File(getFilesDir(),"onestore-resources-v1"),url->{
                if(DistributionPolicy.blocked(url))throw new IOException("Unavailable in this distribution");
                String local=policy.bundledPath(url);return local==null?ClientHttp.open(url,false,false):getAssets().open(local);
            });
        }
        return store;
    }
}
