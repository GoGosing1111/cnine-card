package dev.pages.cnine_card.twa;

import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.View;
import java.util.Locale;
import java.util.concurrent.*;

public class LauncherActivity extends Activity {
    private final ExecutorService work=Executors.newSingleThreadExecutor();
    private LauncherUi ui;private Application app;private AppUpdater updater;
    private ClientPolicy.Update update;private boolean checking,waitingForPermission;
    private String launchUrl;
    private static final int GAME=10,INSTALL=11,PERMISSION=12;
    private String mib(long bytes){return String.format(Locale.KOREAN,"%.1f MB",bytes/1048576.0);}
    private void onUi(Runnable action){runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())action.run();});}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);app=(Application)getApplication();updater=new AppUpdater(this);
        if(app.playing){startActivity(new Intent(this,GameActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));finish();return;}
        String requested=getIntent().getDataString();launchUrl=ClientPolicy.gameUrl(requested)?requested:getString(R.string.nativeStartUrl);
        try{ui=new LauncherUi(this);}catch(Exception e){finish();return;}
        ui.play.setOnClickListener(v->{if(!checking&&app.session!=null){app.playing=true;startActivityForResult(new Intent(this,GameActivity.class).putExtra("url",launchUrl),GAME);}});
        ui.retry.setOnClickListener(v->check());ui.install.setOnClickListener(v->install());check();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(ClientPolicy.gameUrl(intent.getDataString()))launchUrl=intent.getDataString();if(!app.playing)check();}
    private void check(){
        if(checking||app.playing)return;checking=true;ui.enabled(ui.play,false);ui.enabled(ui.retry,false);ui.install.setVisibility(View.GONE);update=null;
        ui.status.setText("업데이트 확인 중");ui.progress.setIndeterminate(true);ui.appStatus.setText("앱 버전 확인 중");
        work.submit(()->{
            try{
                ClientPolicy.Update candidate=updater.check();
                if(candidate!=null){
                    onUi(()->ui.appStatus.setText("새 앱 "+candidate.version+" 다운로드 중"));
                    updater.download(candidate,(done,total)->onUi(()->ui.appStatus.setText("앱 다운로드 "+mib(done)+" / "+mib(total))));
                    onUi(()->{update=candidate;ui.appStatus.setText("새 앱 "+candidate.version+" 설치 준비 완료");ui.install.setVisibility(View.VISIBLE);ui.enabled(ui.install,false);});
                }else{onUi(()->ui.appStatus.setText("앱이 최신 버전입니다."));updater.readyFile().delete();}
            }catch(Exception e){onUi(()->ui.appStatus.setText("앱 업데이트 확인 실패 · 다시 확인할 수 있습니다."));}
            try{
                ResourceStore store=app.store();
                onUi(()->{ui.status.setText("게임 파일 확인 중");ui.detail.setText("저장된 파일을 검사하고 필요한 파일만 받습니다.");});
                ClientPolicy.Manifest next=ClientPolicy.parseManifest(ClientHttp.text(ClientPolicy.MANIFEST_URL,ClientPolicy.MAX_MANIFEST,false));
                store.prune(next);
                java.util.concurrent.atomic.AtomicLong lastProgress=new java.util.concurrent.atomic.AtomicLong();
                store.prepare(next,(done,count,checked,total,downloaded,needed)->{long now=System.currentTimeMillis();if(done<count&&now-lastProgress.get()<100)return;lastProgress.set(now);onUi(()->{
                    ui.progress.setIndeterminate(false);ui.progress.setProgress(count==0?1000:done*1000/count);
                    ui.status.setText(needed==0?"저장 파일 확인 중":"게임 파일 준비 중");
                    ui.detail.setText("파일 "+done+" / "+count+"\n"+(needed==0?"추가 다운로드 없음":"다운로드 "+mib(downloaded)+" / "+mib(needed)));
                });});
                app.session=next;
                onUi(()->{ui.status.setText("게임 준비 완료");ui.detail.setText("저장된 리소스로 실행합니다.");ui.progress.setProgress(1000);ui.enabled(ui.play,true);});
            }catch(Exception e){
                boolean available=false;
                try{ClientPolicy.Manifest prior=app.store().active();available=app.store().complete(prior);if(available)app.session=prior;}catch(Exception ignored){}
                final boolean fallback=available;
                onUi(()->{ui.status.setText("게임 파일 준비를 완료하지 못했습니다.");ui.detail.setText(fallback?"이전에 준비한 파일은 보존되어 있습니다.\n연결을 확인하고 다시 시도할 수 있습니다.":"인터넷 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요.");ui.progress.setIndeterminate(false);ui.enabled(ui.play,fallback);ui.play.setText(fallback?"저장된 파일로 시작":"게임 시작");});
            }finally{onUi(()->{checking=false;ui.enabled(ui.retry,true);ui.enabled(ui.install,true);});}
        });
    }
    private void install(){
        if(update==null||app.playing)return;
        if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){
            waitingForPermission=true;ui.appStatus.setText("리버스콜의 앱 설치 허용 후 돌아와 주세요.");
            try{startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())),PERMISSION);}catch(ActivityNotFoundException e){waitingForPermission=false;ui.appStatus.setText("기기 설정에서 리버스콜의 앱 설치를 허용해 주세요.");}return;
        }
        ui.enabled(ui.install,false);ClientPolicy.Update selected=update;
        work.submit(()->{
            try{updater.verify(updater.readyFile(),selected);onUi(()->{
                if(app.playing)return;
                Intent intent=new Intent(Intent.ACTION_INSTALL_PACKAGE,Uri.parse("content://"+getPackageName()+".updates/update.apk"));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.putExtra(Intent.EXTRA_RETURN_RESULT,true);
                try{startActivityForResult(intent,INSTALL);}catch(ActivityNotFoundException e){ui.appStatus.setText("설치 화면을 열지 못했습니다. 다시 시도해 주세요.");}ui.enabled(ui.install,true);
            });}catch(Exception e){onUi(()->{ui.appStatus.setText("앱 파일 검증 실패 · 다시 확인해 주세요.");ui.install.setVisibility(View.GONE);update=null;});}
        });
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==GAME){app.playing=false;ui.play.setText("게임 시작");check();}
        if(request==PERMISSION&&waitingForPermission){waitingForPermission=false;if(Build.VERSION.SDK_INT<26||getPackageManager().canRequestPackageInstalls())install();else ui.appStatus.setText("설치 허용이 취소됐습니다. 게임은 계속 이용할 수 있습니다.");}
        if(request==INSTALL)ui.appStatus.setText(result==RESULT_OK?"업데이트 설치가 완료됐습니다.":"설치를 완료하지 않았습니다. 다시 설치할 수 있습니다.");
    }
    @Override protected void onDestroy(){work.shutdownNow();super.onDestroy();}
}
