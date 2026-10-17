package dev.pages.cnine_card.twa;

import android.content.Context;
import android.content.pm.*;
import android.os.Build;
import java.io.*;
import java.security.MessageDigest;

public final class AppUpdater {
    public interface Progress {void update(long done,long total);}
    private final Context context;
    public AppUpdater(Context context){this.context=context.getApplicationContext();}
    public ClientPolicy.Update check()throws Exception{return ClientPolicy.parseUpdate(ClientHttp.text(ClientPolicy.UPDATE_URL,32768,true),NativeConfig.VERSION_CODE);}
    public File readyFile(){return new File(context.getFilesDir(),"app-update.apk");}
    @SuppressWarnings("deprecation")
    public void verify(File file,ClientPolicy.Update update)throws Exception{
        if(file.length()!=update.bytes||!ResourceStore.hash(file).equals(update.sha256))throw new IOException("업데이트 파일 검증 실패");
        PackageManager pm=context.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
        PackageInfo apk=pm.getPackageArchiveInfo(file.getPath(),flags),installed=pm.getPackageInfo(context.getPackageName(),flags);
        if(apk==null||!ClientPolicy.PACKAGE.equals(apk.packageName)||!update.version.equals(apk.versionName)||version(apk)!=update.code||version(apk)<=version(installed))throw new IOException("설치할 앱 버전이 올바르지 않습니다.");
        if(!ClientPolicy.SIGNER.equals(signer(apk))||!ClientPolicy.SIGNER.equals(signer(installed)))throw new IOException("공식 앱의 서명이 아닙니다.");
    }
    @SuppressWarnings("deprecation")
    private static long version(PackageInfo info){return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode;}
    @SuppressWarnings("deprecation")
    private static String signer(PackageInfo info)throws Exception{
        Signature[] signatures=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;
        if(signatures==null||signatures.length!=1)throw new IOException("서명 정보를 확인할 수 없습니다.");
        return ResourceStore.hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }
    public File download(ClientPolicy.Update update,Progress progress)throws Exception{
        File target=readyFile();if(target.isFile())try{verify(target,update);progress.update(update.bytes,update.bytes);return target;}catch(Exception ignored){}
        if(context.getFilesDir().getUsableSpace()<update.bytes+32L*1024*1024)throw new IOException("앱 업데이트 저장 공간이 부족합니다.");
        File part=new File(context.getFilesDir(),"app-update.part");
        try{
            try(InputStream in=ClientHttp.open(update.url,true,false);FileOutputStream out=new FileOutputStream(part)){
                byte[] buffer=new byte[65536];long received=0;int n;
                while((n=in.read(buffer))!=-1){ResourceStore.interrupted();received+=n;if(received>update.bytes)throw new IOException("앱 파일 크기 오류");out.write(buffer,0,n);progress.update(received,update.bytes);}out.getFD().sync();
            }
            verify(part,update);
            if(target.exists()&&!target.delete())throw new IOException("앱 파일 교체 실패");
            if(!part.renameTo(target))throw new IOException("앱 파일 저장 실패");return target;
        }finally{part.delete();}
    }
}
