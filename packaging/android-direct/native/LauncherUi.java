package dev.pages.cnine_card.twa;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.BitmapFactory;
import android.view.*;
import android.widget.*;

/** Dedicated generated artwork, native live text, native accessible controls. */
public final class LauncherUi {
    public final TextView status,detail,appStatus;
    public final ProgressBar progress;
    public final Button play,retry,install;
    private final Activity activity;
    public int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setGravity(Gravity.CENTER);t.setPadding(0,dp(8),0,dp(8));return t;}
    private Button button(String label)throws Exception{
        Button b=new Button(activity);b.setText(label);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setTextSize(15);b.setTypeface(null,Typeface.BOLD);
        BitmapDrawable art=new BitmapDrawable(activity.getResources(),BitmapFactory.decodeStream(activity.getAssets().open("launcher/button.webp")));art.setGravity(Gravity.FILL);b.setBackground(art);b.setMinHeight(dp(52));b.setPadding(dp(26),0,dp(26),0);return b;
    }
    private void add(LinearLayout box,View view,int height){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,height<0?height:dp(height));p.setMargins(0,dp(6),0,dp(6));box.addView(view,p);}
    public LauncherUi(Activity activity)throws Exception{
        this.activity=activity;
        FrameLayout root=new FrameLayout(activity);root.setBackgroundColor(Color.rgb(7,10,19));
        ImageView background=new ImageView(activity);background.setImageDrawable(new BitmapDrawable(activity.getResources(),BitmapFactory.decodeStream(activity.getAssets().open("launcher/background.webp"))));background.setScaleType(ImageView.ScaleType.CENTER_CROP);background.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);root.addView(background,new FrameLayout.LayoutParams(-1,-1));
        ScrollView scroll=new ScrollView(activity);scroll.setFillViewport(true);root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout outer=new LinearLayout(activity);outer.setGravity(Gravity.CENTER);outer.setOrientation(LinearLayout.VERTICAL);outer.setPadding(dp(30),dp(48),dp(30),dp(32));scroll.addView(outer,new ScrollView.LayoutParams(-1,-1));
        LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);int width=Math.min(activity.getResources().getDisplayMetrics().widthPixels-dp(60),dp(360));outer.addView(box,new LinearLayout.LayoutParams(width,-2));
        root.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{
            int available=Math.max(1,Math.min(dp(360),r-l-v.getPaddingLeft()-v.getPaddingRight()-dp(60)));
            if(box.getLayoutParams().width!=available){box.getLayoutParams().width=available;box.requestLayout();}
        });
        ImageView logo=new ImageView(activity);logo.setImageResource(activity.getApplicationInfo().icon);logo.setContentDescription("리버스콜");box.addView(logo,new LinearLayout.LayoutParams(dp(64),dp(64)));
        TextView title=text("리버스콜",28,Color.WHITE);title.setTypeface(null,Typeface.BOLD);add(box,title,-2);
        add(box,text("ANDROID  ·  "+NativeConfig.VERSION_NAME,11,0xffb7a0e5),-2);
        status=text("업데이트 확인 중",18,Color.WHITE);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);add(box,status,-2);
        detail=text("저장된 게임 파일을 확인합니다.",13,0xffd1d1e2);add(box,detail,-2);
        progress=new ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(0xffbb8cfa));add(box,progress,5);
        appStatus=text("앱 버전 확인 중",12,0xffc5b1e8);add(box,appStatus,-2);
        install=button("업데이트 설치");install.setVisibility(View.GONE);add(box,install,52);
        play=button("게임 시작");play.setEnabled(false);play.setAlpha(.45f);add(box,play,52);
        retry=button("다시 확인");retry.setEnabled(false);retry.setAlpha(.45f);add(box,retry,52);
        add(box,text("게임 파일은 기기에 저장해 다시 사용합니다.\n계정과 플레이에는 인터넷 연결이 필요합니다.",11,0xffa7a7bb),-2);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        activity.setContentView(root);
    }
    public void enabled(Button b,boolean enabled){b.setEnabled(enabled);b.setAlpha(enabled?1f:.45f);}
}
