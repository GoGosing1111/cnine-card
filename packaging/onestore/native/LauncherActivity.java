package dev.pages.cnine_card.twa;

import android.app.Activity;
import android.content.*;
import android.os.Bundle;
import java.util.Locale;
import java.util.concurrent.*;

/** Store release: resources may refresh, but executable updates use the store. */
public class LauncherActivity extends Activity {
    private final ExecutorService work=Executors.newSingleThreadExecutor();
    private LauncherUi ui;private Application app;private boolean checking;
    private static final int GAME=10;
    private String mib(long bytes){return String.format(Locale.KOREAN,"%.1f MB",bytes/1048576.0);}
    private void onUi(Runnable action){runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())action.run();});}
    @Override public void onCreate(Bundle state){
        super.onCreate(state);app=(Application)getApplication();
        if(app.playing){startActivity(new Intent(this,GameActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));finish();return;}
        try{ui=new LauncherUi(this);}catch(Exception e){finish();return;}
        ui.appStatus.setText("ONE store · "+NativeConfig.VERSION_NAME);
        ui.play.setOnClickListener(v->{if(!checking&&app.session!=null){app.playing=true;startActivityForResult(new Intent(this,GameActivity.class).putExtra("url",getString(R.string.nativeStartUrl)),GAME);}});
        ui.retry.setOnClickListener(v->check());check();
    }
    private void check(){
        if(checking||app.playing)return;checking=true;ui.enabled(ui.play,false);ui.enabled(ui.retry,false);
        ui.status.setText("게임 파일 확인 중");ui.progress.setIndeterminate(true);
        work.submit(()->{
            try{
                ResourceStore store=app.store();
                String remote=ClientHttp.text(ClientPolicy.MANIFEST_URL,ClientPolicy.MAX_MANIFEST,false);
                ClientPolicy.Manifest next=ClientPolicy.parseManifest(app.policy().mergeManifest(remote));
                store.prune(next);java.util.concurrent.atomic.AtomicLong lastProgress=new java.util.concurrent.atomic.AtomicLong();
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
                onUi(()->{ui.status.setText("게임 파일 준비를 완료하지 못했습니다.");ui.detail.setText(fallback?"저장된 파일로 시작하거나 연결을 확인한 뒤 다시 시도해 주세요.":"인터넷 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요.");ui.progress.setIndeterminate(false);ui.enabled(ui.play,fallback);ui.play.setText(fallback?"저장된 파일로 시작":"게임 시작");});
            }finally{onUi(()->{checking=false;ui.enabled(ui.retry,true);});}
        });
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==GAME){app.playing=false;ui.play.setText("게임 시작");check();}}
    @Override protected void onDestroy(){work.shutdownNow();super.onDestroy();}
}
