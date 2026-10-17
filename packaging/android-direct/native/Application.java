package dev.pages.cnine_card.twa;

public class Application extends android.app.Application {
    private ResourceStore store;
    public volatile ClientPolicy.Manifest session;
    public volatile boolean playing;
    public synchronized ResourceStore store()throws java.io.IOException{
        if(store==null)store=new ResourceStore(new java.io.File(getFilesDir(),"resources-v1"),url->ClientHttp.open(url,false,false));
        return store;
    }
}
