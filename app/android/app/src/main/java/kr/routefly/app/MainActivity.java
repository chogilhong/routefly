package kr.routefly.app;

import android.Manifest;
import android.content.pm.PackageManager;
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
        super.onCreate(savedInstanceState);
        // 핸드폰 글자 크기 설정(삼성 기본이 큼)이 웹 화면 글자만 1.6배쯤 키워 그래프 이름 · 버튼이 서로 겹쳤습니다.
        // 따라가기 화면은 밖에서 보려고 이미 큰 글자로 만들었으므로 앱 안에서는 설계한 크기(100%) 그대로 씁니다.
        bridge.getWebView().getSettings().setTextZoom(100);
        // 안드로이드 13+ : 화면을 꺼도 위치를 기록하려면 "따라가는 중" 알림을 띄워야 하고, 알림 권한이 필요합니다.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }
}
