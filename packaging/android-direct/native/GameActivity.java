package dev.pages.cnine_card.twa;

import android.app.*;
import android.content.*;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.util.*;

public final class GameActivity extends Activity {
    private Application app;private ResourceStore store;private ClientPolicy.Manifest manifest;
    private FrameLayout root;private final ArrayList<WebView> views=new ArrayList<>();
    private View fullscreen;private WebChromeClient.CustomViewCallback fullscreenCallback;
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);app=(Application)getApplication();manifest=app.session;
        try{store=app.store();if(manifest==null){finish();return;}}catch(Exception e){finish();return;}
        app.playing=true;root=new FrameLayout(this);root.setBackgroundColor(0xff080c17);
        root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i.consumeSystemWindowInsets();});setContentView(root);
        // This WebView profile belongs only to this APK; Chrome/PWA storage is untouched.
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){return intercept(r);}});
        CookieManager.getInstance().setAcceptCookie(true);
        WebView web=createWebView();String url=getIntent().getStringExtra("url");web.loadUrl(ClientPolicy.gameUrl(url)?url:getString(R.string.nativeStartUrl));
    }
    private WebResourceResponse response(int status,String reason,String type,InputStream body,Map<String,String> headers){return new WebResourceResponse(type,"UTF-8",status,reason,headers,body);}
    private WebResourceResponse error(int status,String message){return response(status,"Resource unavailable","text/plain",new ByteArrayInputStream(message.getBytes(java.nio.charset.StandardCharsets.UTF_8)),Collections.singletonMap("Cache-Control","no-store"));}
    private WebResourceResponse intercept(WebResourceRequest request){
        String url=request.getUrl().toString();
        if(ClientPolicy.gameUrl(url)&&"/service-worker.js".equals(request.getUrl().getPath()))return error(404,"Resources are managed by the Android client.");
        String path=ClientPolicy.resourcePath(url,request.getMethod());ClientPolicy.Entry e=path==null?null:manifest.files.get(path);
        if(e==null)return null; // WebView forwards APIs, cookies, bodies and sockets normally; no disk write.
        try{
            File f=store.ensure(e,manifest.releaseId,null);String range=null;for(Map.Entry<String,String> h:request.getRequestHeaders().entrySet())if(h.getKey().equalsIgnoreCase("Range"))range=h.getValue();
            long[] span=ClientPolicy.range(range,e.bytes);
            Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("Accept-Ranges","bytes");headers.put("X-ReverseCall-Resource","disk");headers.put("Access-Control-Allow-Origin",ClientPolicy.ORIGIN);
            if(span==null){headers.put("Content-Range","bytes */"+e.bytes);return response(416,"Range Not Satisfiable",e.type,new ByteArrayInputStream(new byte[0]),headers);}
            long count=e.bytes==0?0:span[1]-span[0]+1;headers.put("Content-Length",Long.toString(count));
            if(range!=null)headers.put("Content-Range","bytes "+span[0]+"-"+span[1]+"/"+e.bytes);
            InputStream stream=new ByteArrayInputStream(new byte[0]);
            if(!"HEAD".equals(request.getMethod())&&count>0){
                FileInputStream input=new FileInputStream(f);input.getChannel().position(span[0]);final long length=count;
                stream=new FilterInputStream(input){long remaining=length;@Override public int read()throws IOException{if(remaining<=0)return -1;int b=super.read();if(b>=0)remaining--;return b;}@Override public int read(byte[] b,int offset,int len)throws IOException{if(remaining<=0)return -1;int n=in.read(b,offset,(int)Math.min(len,remaining));if(n>0)remaining-=n;return n;}};
            }
            return response(range==null?200:206,range==null?"OK":"Partial Content",e.type,stream,headers);
        }catch(Exception ex){return error(503,"게임 파일을 받지 못했습니다. 런처에서 파일을 다시 확인해 주세요.");}
    }
    private boolean navigate(WebResourceRequest request){
        String url=request.getUrl().toString();if(ClientPolicy.gameUrl(url)||"about:blank".equals(url))return false;
        if(request.isForMainFrame()&&request.hasGesture()&&"https".equals(request.getUrl().getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()).addCategory(Intent.CATEGORY_BROWSABLE));}catch(ActivityNotFoundException ignored){}
        return true;
    }
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView(){
        WebView web=new WebView(this);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setCacheMode(WebSettings.LOAD_NO_CACHE);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(true);s.setMediaPlaybackRequiresUserGesture(false);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);s.setUserAgentString(s.getUserAgentString()+" ReverseCallAndroid/"+NativeConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){return intercept(r);}
            @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){boolean blocked=navigate(r);if(blocked&&r.isForMainFrame()&&views.size()>1&&w!=views.get(0))runOnUiThread(()->{if(views.contains(w))removeWebView(w);});return blocked;}
            @Override public void onReceivedError(WebView w,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())Toast.makeText(GameActivity.this,"연결을 확인해 주세요. 뒤로가기로 런처에 돌아갈 수 있습니다.",Toast.LENGTH_LONG).show();}
            @Override public boolean onRenderProcessGone(WebView w,RenderProcessGoneDetail detail){removeWebView(w);return true;}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onCreateWindow(WebView source,boolean dialog,boolean gesture,Message result){
                if(views.size()>=4)return false;WebView child=createWebView();((WebView.WebViewTransport)result.obj).setWebView(child);result.sendToTarget();return true;
            }
            @Override public void onCloseWindow(WebView window){removeWebView(window);}
            @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
            @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullscreen!=null){callback.onCustomViewHidden();return;}fullscreen=view;fullscreenCallback=callback;root.addView(view,new FrameLayout.LayoutParams(-1,-1));}
            @Override public void onHideCustomView(){hideFullscreen();}
        });
        web.setDownloadListener((url,ua,disposition,mime,length)->{if(ClientPolicy.gameUrl(url))try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(ActivityNotFoundException ignored){}});
        for(WebView prior:views)prior.setVisibility(View.GONE);views.add(web);root.addView(web,new FrameLayout.LayoutParams(-1,-1));return web;
    }
    private void hideFullscreen(){if(fullscreen!=null){root.removeView(fullscreen);fullscreen=null;if(fullscreenCallback!=null)fullscreenCallback.onCustomViewHidden();fullscreenCallback=null;}}
    private void removeWebView(WebView web){root.removeView(web);views.remove(web);web.stopLoading();web.destroy();if(views.isEmpty())finish();else views.get(views.size()-1).setVisibility(View.VISIBLE);}
    @Override public void onBackPressed(){if(fullscreen!=null){hideFullscreen();return;}if(views.isEmpty()){finish();return;}WebView top=views.get(views.size()-1);if(top.canGoBack())top.goBack();else if(views.size()>1)removeWebView(top);else finish();}
    @Override protected void onPause(){for(WebView w:views)w.onPause();CookieManager.getInstance().flush();super.onPause();}
    @Override protected void onResume(){super.onResume();for(WebView w:views)w.onResume();}
    @Override protected void onDestroy(){hideFullscreen();for(WebView w:views){w.stopLoading();root.removeView(w);w.destroy();}views.clear();app.playing=false;super.onDestroy();}
}
