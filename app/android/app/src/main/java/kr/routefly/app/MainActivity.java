package kr.routefly.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * routefly 앱 - 서버의 routefly 화면(capacitor.config.json 의 server.url)을 띄웁니다.
 * 백그라운드 위치 · 음성 · 공유는 플러그인(background-geolocation · text-to-speech · share · filesystem)이 맡고,
 * 웹 화면(hike.js)이 앱 안인지 보고 골라 씁니다.
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_NOTIFICATIONS = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RfAlivePlugin.class);   // 산악회 방 "폰은 켜짐"(화면이 꺼져도 1분마다) - super.onCreate 앞에서 등록
        registerPlugin(RfNfcPlugin.class);     // NFC 스티커에 참가 링크 쓰기(앱 웹뷰에는 Web NFC 가 없음, 2026-10-27)
        super.onCreate(savedInstanceState);
        // 핸드폰 글자 크기 설정(삼성 기본이 큼)이 웹 화면 글자만 1.6배쯤 키워 그래프 이름 · 버튼이 서로 겹쳤습니다.
        // 따라가기 화면은 밖에서 보려고 이미 큰 글자로 만들었으므로 앱 안에서는 설계한 크기(100%) 그대로 씁니다.
        bridge.getWebView().getSettings().setTextZoom(100);
        // 안드로이드 13+ : 화면을 꺼도 위치를 기록하려면 "따라가는 중" 알림을 띄워야 하고, 알림 권한이 필요합니다.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
        // 첫 링크(getIntent)는 BridgeActivity.load() 가 onNewIntent 로 넘겨 openLink 가 받음(여기서 또 부르면 두 번 열림)
    }

    /** 앱이 열려 있을 때 링크를 누름(launchMode singleTask). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openLink(intent);
    }

    /**
     * 앱 링크(2026-10-20 홍TV님) - 산악회 방 참가 링크(https://routefly.kr/routefly/party.html?c=…)로 열렸으면 그 화면을 띄움.
     * 같은 서버 주소라 웹뷰 안에서 열리고, 앱 안에서 참가해야 화면을 꺼도 위치가 감(party.js - BackgroundGeolocation).
     */
    private void openLink(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (!isPartyLink(u)) return;
        // 브라우저(카톡 등)에서 이미 참가한 사람의 열쇠 - 주소 # 뒤로 넘김(서버로 가지 않음, party.js takeToken 이 받아 바로 지움)
        String t = intent.getStringExtra("rf_token");
        final String url = u.toString() + (t != null && t.matches("[A-Za-z0-9_-]{16,64}") ? "#t=" + t : "");
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
    }

    /** routefly.kr 의 https 산악회 방 주소만(다른 주소로 웹뷰를 돌리지 않음). */
    static boolean isPartyLink(Uri u) {
        return u != null && "https".equals(u.getScheme()) && "routefly.kr".equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith("/routefly/party.html");
    }
}
