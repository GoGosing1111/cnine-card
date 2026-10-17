package dev.pages.cnine_card.twa;

import java.io.*;
import java.net.*;
import java.util.zip.GZIPInputStream;

public final class ClientHttp {
    public static InputStream open(String url,boolean apk,boolean feed) throws Exception {
        for(int hop=0;hop<5;hop++){
            if(!(feed?ClientPolicy.UPDATE_URL.equals(url):ClientPolicy.downloadHost(url,apk)))throw new IOException("허용되지 않은 다운로드 주소");
            final HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(feed?5000:10000);c.setReadTimeout(feed?7000:20000);
            c.setUseCaches(false);c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("Cache-Control","no-cache");
            // No CookieHandler, auth token, device identifier or game session is attached.
            int status=c.getResponseCode();
            if(status==301||status==302||status==303||status==307||status==308){String location=c.getHeaderField("Location");c.disconnect();if(location==null||feed)throw new IOException("다운로드 경로 변경 오류");url=new URL(new URL(url),location).toString();continue;}
            if(status!=200){c.disconnect();throw new IOException("다운로드 응답 오류 ("+status+")");}
            InputStream raw=c.getInputStream();InputStream data="gzip".equalsIgnoreCase(c.getContentEncoding())?new GZIPInputStream(raw):raw;
            return new FilterInputStream(data){@Override public void close()throws IOException{try{super.close();}finally{c.disconnect();}}};
        }
        throw new IOException("다운로드 경로 변경이 너무 많습니다.");
    }
    public static String text(String url,int limit,boolean feed) throws Exception {
        try(InputStream in=open(url,false,feed);ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();if(out.size()+n>limit)throw new IOException("정보 크기 제한 초과");out.write(buffer,0,n);}return out.toString("UTF-8");
        }
    }
}
