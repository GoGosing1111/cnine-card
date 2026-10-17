package dev.pages.cnine_card.twa;

import java.io.*;
import java.net.URI;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Content addressed persistent files. A failed prepare never replaces the active manifest. */
public final class ResourceStore {
    public interface Fetcher { InputStream open(String url) throws Exception; }
    public interface Progress { void update(int done,int count,long checked,long total,long downloaded,long needed); }
    private final File root,objects;private final Fetcher fetcher;
    private final ConcurrentHashMap<String,Object> locks=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,String> verified=new ConcurrentHashMap<>();
    public final AtomicLong hits=new AtomicLong(),downloads=new AtomicLong();
    public ResourceStore(File root,Fetcher fetcher)throws IOException{this.root=root;this.objects=new File(root,"objects");this.fetcher=fetcher;if(!objects.isDirectory()&&!objects.mkdirs())throw new IOException("저장 폴더 생성 실패");}
    static void interrupted()throws InterruptedIOException{if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("준비가 중단됐습니다.");}
    public static String hex(byte[] bytes){StringBuilder b=new StringBuilder();for(byte x:bytes)b.append(String.format(Locale.ROOT,"%02x",x&255));return b.toString();}
    public static String hash(File file)throws Exception{MessageDigest h=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){interrupted();h.update(b,0,n);}}return hex(h.digest());}
    public File file(String hash){if(!hash.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Invalid hash");return new File(objects,hash);}
    public boolean has(ClientPolicy.Entry e)throws Exception{
        File f=file(e.sha256);if(!f.isFile()||f.length()!=e.bytes)return false;
        String stamp=f.length()+":"+f.lastModified();if(stamp.equals(verified.get(e.sha256)))return true;
        if(!hash(f).equals(e.sha256))return false;verified.put(e.sha256,stamp);return true;
    }
    public File ensure(ClientPolicy.Entry e,String release,AtomicLong transferred)throws Exception{
        Object lock=locks.computeIfAbsent(e.sha256,k->new Object());
        synchronized(lock){
            interrupted();if(has(e)){hits.incrementAndGet();return file(e.sha256);}
            String url=new URI("https","cnine-card.pages.dev",e.path,"androidRelease="+release,null).toASCIIString();
            File target=file(e.sha256),part=new File(objects,e.sha256+".part");
            try(InputStream in=fetcher.open(url);FileOutputStream out=new FileOutputStream(part)){
                MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] b=new byte[65536];long received=0;int n;
                while((n=in.read(b))!=-1){interrupted();received+=n;if(received>e.bytes)throw new IOException("게임 파일 크기가 변경됐습니다. 다시 확인해 주세요.");out.write(b,0,n);digest.update(b,0,n);if(transferred!=null)transferred.addAndGet(n);}
                if(received!=e.bytes||!hex(digest.digest()).equals(e.sha256))throw new IOException("게임 파일 검증 실패. 업데이트를 다시 확인해 주세요.");out.getFD().sync();
            }catch(Exception failure){part.delete();throw failure;}
            if(target.exists()&&!target.delete()){part.delete();throw new IOException("손상 파일 교체 실패");}
            if(!part.renameTo(target)){part.delete();throw new IOException("게임 파일 저장 실패");}
            verified.remove(e.sha256);downloads.incrementAndGet();return target;
        }
    }
    public ClientPolicy.Manifest active(){for(String name:new String[]{"active.json","active.json.bak"})try{return ClientPolicy.parseManifest(read(new File(root,name),ClientPolicy.MAX_MANIFEST));}catch(Exception ignored){}return null;}
    public boolean complete(ClientPolicy.Manifest m)throws Exception{if(m==null)return false;for(ClientPolicy.Entry e:m.files.values())if(e.essential&&!has(e))return false;return true;}
    public static String read(File f,int limit)throws Exception{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("File too large");out.write(b,0,n);}return out.toString("UTF-8");}}
    public static void atomicWrite(File target,String value)throws Exception{
        File part=new File(target.getPath()+".tmp"),backup=new File(target.getPath()+".bak");
        try(FileOutputStream out=new FileOutputStream(part)){out.write(value.getBytes("UTF-8"));out.getFD().sync();}
        if(part.renameTo(target))return; // Atomic replacement on the Android filesystem.
        if(backup.exists()&&!backup.delete())throw new IOException("Cannot clear previous metadata backup");
        if(target.exists()&&!target.renameTo(backup))throw new IOException("Cannot preserve active metadata");
        if(!part.renameTo(target)){backup.renameTo(target);throw new IOException("Cannot activate prepared metadata");}
        backup.delete();
    }
    public void prepare(ClientPolicy.Manifest manifest,Progress progress)throws Exception{
        verified.clear(); // Recheck even same-length corruption at each launcher preparation.
        Map<String,ClientPolicy.Entry> unique=new LinkedHashMap<>();for(ClientPolicy.Entry e:manifest.files.values())if(e.essential)unique.put(e.sha256,e);
        List<ClientPolicy.Entry> entries=new ArrayList<>(unique.values());long total=0,missing=0;
        for(ClientPolicy.Entry e:entries){interrupted();total+=e.bytes;if(!has(e))missing+=e.bytes;}
        if(root.getUsableSpace()<missing+64L*1024*1024)throw new IOException("저장 공간이 부족합니다. 휴대폰의 여유 공간을 확보해 주세요.");
        final long finalTotal=total,needed=missing;AtomicLong transferred=new AtomicLong();
        ExecutorService workers=Executors.newFixedThreadPool(4);List<Future<File>> futures=new ArrayList<>();
        try{
            progress.update(0,entries.size(),0,total,0,missing);
            for(ClientPolicy.Entry e:entries)futures.add(workers.submit(()->ensure(e,manifest.releaseId,transferred)));
            int done=0;long checked=0;
            for(int i=0;i<futures.size();i++){interrupted();futures.get(i).get();checked+=entries.get(i).bytes;progress.update(++done,entries.size(),checked,finalTotal,transferred.get(),needed);}
            interrupted();if(active()==null||!manifest.releaseId.equals(active().releaseId))atomicWrite(new File(root,"active.json"),manifest.raw);
        }catch(ExecutionException e){throw e.getCause() instanceof Exception?(Exception)e.getCause():e;}
        finally{for(Future<?> f:futures)if(!f.isDone())f.cancel(true);workers.shutdownNow();try{workers.awaitTermination(25,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
    }
    public void prune(ClientPolicy.Manifest next)throws Exception{
        Set<String> keep=new HashSet<>();for(ClientPolicy.Entry e:next.files.values())if(e.essential)keep.add(e.sha256);
        ClientPolicy.Manifest old=active();if(old!=null)for(ClientPolicy.Entry e:old.files.values())if(e.essential)keep.add(e.sha256);
        List<File> candidates=new ArrayList<>();long bytes=0;File[] files=objects.listFiles();if(files==null)return;
        for(File f:files){if(f.getName().endsWith(".part")){if(f.lastModified()<System.currentTimeMillis()-86400000L)f.delete();continue;}if(!f.getName().matches("[a-f0-9]{64}"))continue;bytes+=f.length();if(!keep.contains(f.getName()))candidates.add(f);}
        candidates.sort(Comparator.comparingLong(File::lastModified));
        for(File f:candidates){if(bytes<=ClientPolicy.CACHE_BUDGET)break;long size=f.length();if(f.delete()){bytes-=size;verified.remove(f.getName());}}
    }
}
