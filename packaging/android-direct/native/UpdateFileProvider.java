package dev.pages.cnine_card.twa;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Only the verified update APK can be read by the system installer using a temporary URI grant. */
public final class UpdateFileProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}
    private File apk(Uri uri)throws FileNotFoundException{
        if(!"/update.apk".equals(uri.getPath())||!uri.getAuthority().equals(ClientPolicy.PACKAGE+".updates"))throw new FileNotFoundException();
        File file=new File(getContext().getFilesDir(),"app-update.apk");if(!file.isFile())throw new FileNotFoundException();return file;
    }
    @Override public String getType(Uri uri){return "application/vnd.android.package-archive";}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException();return ParcelFileDescriptor.open(apk(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){
        try{File f=apk(uri);MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});c.addRow(new Object[]{"ReverseCall-update.apk",f.length()});return c;}catch(FileNotFoundException e){return null;}
    }
    @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
