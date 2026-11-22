package kr.routefly.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;
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
        registerPlugin(RfGalleryPlugin.class); // 찍은 사진을 갤러리 Pictures/routefly 에도(안드로이드 10+, 2026-11-01)
        registerPlugin(RfGpxPlugin.class);     // 카톡 · 파일 앱에서 연 · 공유한 GPX 를 따라가기로(2026-11-22)
        super.onCreate(savedInstanceState);
        // 핸드폰 글자 크기 설정(삼성 기본이 큼)이 웹 화면 글자만 1.6배쯤 키워 그래프 이름 · 버튼이 서로 겹쳤습니다.
        // 따라가기 화면은 밖에서 보려고 이미 큰 글자로 만들었으므로 앱 안에서는 설계한 크기(100%) 그대로 씁니다.
        bridge.getWebView().getSettings().setTextZoom(100);
        // 안드로이드 13+ : 화면을 꺼도 위치를 기록하려면 "따라가는 중" 알림을 띄워야 하고, 알림 권한이 필요합니다.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
        // 폰 뒤로 가기(2026-10-30 홍TV님 "앱이 닫혀 버리는데"): 웹 화면에 앞 화면이 있으면 그리로(통계 → 안내 등).
        // 따라가기(hike.html) · 산악회 방(party.html)은 예전처럼 앱을 뒤로 보냄 - 화면을 떠나면 위치 기록이 끊길 수 있음
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                android.webkit.WebView w = bridge.getWebView();
                if (w != null && w.canGoBack() && webBack(w.getUrl())) {
                    w.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
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
        if (openGpx(intent)) return;
        Uri u = intent == null ? null : intent.getData();
        // 앱 아이콘 길게 누르기 바로가기(res/xml/shortcuts.xml, 2026-11-18) - 정해 둔 routefly 화면만 웹뷰로
        // 따라가기 기록 · 산악회 방 위치 보내기 중이면 옮기지 않음(점검 13차 7: 바로가기로 화면이 바뀌면 기록이 끊길 수 있었음) - 화면의 window.rfBusy() 로 물음
        if (isShortcutLink(u)) {
            final String s = u.toString();
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript("(window.rfBusy && window.rfBusy()) ? 1 : 0", v -> {
                if ("1".equals(v)) android.widget.Toast.makeText(this, "기록 중이라 화면을 바꾸지 않았습니다. 기록을 끝낸 뒤 다시 눌러 주세요.", android.widget.Toast.LENGTH_LONG).show();
                else bridge.getWebView().loadUrl(s);
            }));
            return;
        }
        if (!isPartyLink(u)) return;
        // 브라우저(카톡 등)에서 이미 참가한 사람의 열쇠 - 주소 # 뒤로 넘김(서버로 가지 않음, party.js takeToken 이 받아 바로 지움)
        String t = intent.getStringExtra("rf_token");
        // 카톡에서 넘어온 회사 사무실 열쇠(2026-10-29, no-kakao.js S.rf_office) - #k= 로(party-office.js 가 받아 주소에서 지움)
        String k = intent.getStringExtra("rf_office");
        // 내 사무실 묶음(2026-10-30, S.rf_bundle) - #b= 로
        String b = intent.getStringExtra("rf_bundle");
        final String url = u.toString() + (t != null && t.matches("[A-Za-z0-9_-]{16,64}") ? "#t=" + t
                : k != null && u.getFragment() == null && u.getPath().startsWith("/routefly/party-office.html") ? officeHash(k)
                : b != null && b.matches("[A-Za-z0-9_-]{20,64}") && u.getFragment() == null && u.getPath().startsWith("/routefly/party-office.html") ? "#b=" + b : "");
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
    }

    /** 받는 GPX 크기 한도 - 따라가기 📂 GPX 열기와 같은 5MB. */
    static final int GPX_MAX_BYTES = 5 * 1024 * 1024;

    /**
     * 카톡 · 파일 앱의 "다른 앱으로 열기"(VIEW) · "공유"(SEND)로 온 GPX(2026-11-22 홍TV님 - 폰 · 시계로 만든 GPX 를 주고받음). content:// 만 받음.
     * 읽어서 RfGpxPlugin 에 맡기고, 따라가기 화면이면 바로 가져가게(rfGpxInbox), 다른 화면이면 따라가기로 옮김(뜨면서 hike.js 가 가져감).
     * 따라가기 기록 · 산악회 위치 보내기 중에 다른 화면이면 옮기지 않고 알림(맡긴 것은 다음에 따라가기를 열 때 열림). GPX 로 온 것이면 true.
     */
    private boolean openGpx(Intent intent) {
        Uri src = gpxUri(intent);
        if (src == null) return false;
        new Thread(() -> {
            String name = displayName(src), text = null, err = null;
            try (java.io.InputStream in = getContentResolver().openInputStream(src)) {
                byte[] b = readMax(in, GPX_MAX_BYTES + 1);
                if (b.length > GPX_MAX_BYTES) err = "GPX 가 너무 큽니다(5MB 까지).";
                else {
                    text = new String(b, java.nio.charset.StandardCharsets.UTF_8);
                    if (!looksGpx(text)) { text = null; err = "GPX 파일이 아닙니다" + (name != null ? "(" + name + ")" : "") + "."; }
                }
            } catch (Exception e) {
                err = "GPX 를 읽지 못했습니다.";
            }
            RfGpxPlugin.put(name, text, err);
            bridge.getWebView().post(() -> {
                android.webkit.WebView w = bridge.getWebView();
                String now = w.getUrl(), path = now == null ? null : Uri.parse(now).getPath();
                if (path != null && path.endsWith("/hike.html")) { w.evaluateJavascript("window.rfGpxInbox && window.rfGpxInbox()", null); return; }
                w.evaluateJavascript("(window.rfBusy && window.rfBusy()) ? 1 : 0", v -> {
                    if ("1".equals(v)) android.widget.Toast.makeText(this, "기록 중이라 화면을 바꾸지 않았습니다. 따라가기 화면을 열면 GPX 가 열립니다.", android.widget.Toast.LENGTH_LONG).show();
                    else w.loadUrl(HIKE_URL);
                });
            });
        }).start();
        return true;
    }

    static final String HIKE_URL = "https://routefly.kr/routefly/hike.html";

    /** VIEW 의 데이터 또는 SEND 의 EXTRA_STREAM 이 content:// 이면 그 주소, 아니면 null. */
    @SuppressWarnings("deprecation")
    static Uri gpxUri(Intent intent) {
        if (intent == null) return null;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) u = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Object o = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (o instanceof Uri) u = (Uri) o;
        }
        return u != null && "content".equals(u.getScheme()) ? u : null;
    }

    /** 순수 함수 - 앞 4,000자 안에 <gpx 여는 꼬리표가 있는가(받는 MIME 에 application/octet-stream 이 있어 아무 파일이나 올 수 있음). */
    static boolean looksGpx(String text) {
        if (text == null) return false;
        String head = text.substring(0, Math.min(4000, text.length())).toLowerCase(java.util.Locale.ROOT);
        return head.contains("<gpx");
    }

    /** 최대 max 바이트까지 읽음(넘으면 max 바이트로 끊어 돌려줌 - 부른 쪽이 길이로 앎). */
    static byte[] readMax(java.io.InputStream in, int max) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while (out.size() < max && (n = in.read(buf, 0, Math.min(buf.length, max - out.size()))) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** 카톡 · 파일 앱이 알려 주는 파일 이름(없으면 null). */
    private String displayName(Uri u) {
        try (android.database.Cursor c = getContentResolver().query(u, new String[] {android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            // 이름 없이 엶
        }
        return null;
    }

    /** 순수 함수 - 이 화면에서 폰 뒤로 가기를 웹 앞 화면으로 돌릴지. 따라가기 · 산악회 방은 아님(위치 기록 화면). */
    static boolean webBack(String url) {
        if (url == null) return false;
        String path = Uri.parse(url).getPath();
        return path != null && !path.endsWith("/hike.html") && !path.endsWith("/party.html");
    }

    /** 사무실 열쇠 하나면 #k=, 점으로 이은 여럿(이 기기의 사무실 모두 - 2026-10-30)이면 #ks=. 모양이 다르면 "". */
    static String officeHash(String k) {
        if (k.matches("[A-Za-z0-9_-]{20,64}")) return "#k=" + k;
        if (k.length() <= 700 && k.matches("[A-Za-z0-9_-]{20,64}(\\.[A-Za-z0-9_-]{20,64}){1,9}")) return "#ks=" + k;
        return "";
    }

    /** 바로가기 주소(res/xml/shortcuts.xml 과 같은 넷)만 - https routefly.kr 의 따라가기 · 코스 모음 · 출조 · 드론, ? · # 없이. */
    static boolean isShortcutLink(Uri u) {
        return u != null && "https".equals(u.getScheme()) && "routefly.kr".equals(u.getHost()) && u.getQuery() == null && u.getFragment() == null
                && SHORTCUTS.contains(u.getPath());
    }

    static final java.util.List<String> SHORTCUTS = java.util.Arrays.asList("/routefly/hike.html", "/routefly/tidefly.html", "/routefly/dronefly.html", "/routefly/m/");

    /** routefly.kr 의 https 산악회 방 · 회사 사무실(2026-10-29) 주소만(다른 주소로 웹뷰를 돌리지 않음). 사무실 링크의 #k= 는 u.toString() 에 그대로 실림. */
    static boolean isPartyLink(Uri u) {
        return u != null && "https".equals(u.getScheme()) && "routefly.kr".equals(u.getHost())
                && u.getPath() != null && (u.getPath().startsWith("/routefly/party.html") || u.getPath().startsWith("/routefly/party-office.html"));
    }
}
