package kr.routefly.app;

import android.content.Context;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 산악회 방 "폰은 켜짐"(2026-10-21 PC 시험): 화면이 꺼지면 웹 화면 타이머가 멈추고, 폰 위치를 끄면 위치 콜백도 안 불려
 * 인솔자에게 소식이 끊긴 것처럼 보였음. 앱(안드로이드)이 직접 1분마다 /api/party/ping 에 배터리만 보냄(위치 없음).
 * party.js 가 위치 보내기를 켤 때 start({url, token}), 하산 탑승 · 나가기 · 방 끝에 stop(). 서버가 410(방 끝 · 내보냄)이면 저절로 멈춤.
 * 화면이 꺼진 동안 CPU 가 잠들지 않게 부분 깨우기(PARTIAL_WAKE_LOCK)를 잡음 - 최대 14시간.
 */
@CapacitorPlugin(name = "RfAlive")
public class RfAlivePlugin extends Plugin {

    private static final long EVERY_MS = 60_000L, MAX_MS = 14L * 3600_000L;
    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock lock;
    private String url, token;
    private long startedAt;

    @PluginMethod
    public void start(PluginCall call) {
        String u = call.getString("url"), t = call.getString("token");
        // routefly 서버의 ping 주소 · 열쇠 모양만(다른 곳으로 보내지 않음)
        if (u == null || !u.startsWith("https://routefly.kr/") || !u.endsWith("/api/party/ping") || t == null || !t.matches("[A-Za-z0-9_-]{16,64}")) {
            call.reject("bad args");
            return;
        }
        synchronized (this) {
            stopNow();
            url = u;
            token = t;
            startedAt = System.currentTimeMillis();
            thread = new HandlerThread("rf-alive");
            thread.start();
            handler = new Handler(thread.getLooper());
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "routefly:party-alive");
                lock.setReferenceCounted(false);
                lock.acquire(MAX_MS);
            }
            handler.postDelayed(tick, EVERY_MS);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (this) { stopNow(); }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) { stopNow(); }
    }

    private void stopNow() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (lock != null && lock.isHeld()) lock.release();
        handler = null;
        thread = null;
        lock = null;
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            String u, t;
            synchronized (RfAlivePlugin.this) {
                if (handler == null) return;
                if (System.currentTimeMillis() - startedAt > MAX_MS) { stopNow(); return; }
                u = url;
                t = token;
            }
            int code = send(u, t);
            synchronized (RfAlivePlugin.this) {
                if (code == 410 || code == 404) { stopNow(); return; }   // 방이 끝났거나 내보냄 · 기능 꺼짐
                if (handler != null) handler.postDelayed(this, EVERY_MS);
            }
        }
    };

    /** 한 번 보내기 - 응답 코드(실패하면 -1). */
    private int send(String u, String t) {
        HttpURLConnection c = null;
        try {
            int batt = -1;
            BatteryManager bm = (BatteryManager) getContext().getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) batt = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
            String body = "{\"token\":\"" + t + "\"" + (batt >= 0 && batt <= 100 ? ",\"batt\":" + batt : "") + "}";
            c = (HttpURLConnection) new URL(u).openConnection();
            c.setConnectTimeout(15_000);
            c.setReadTimeout(15_000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            return c.getResponseCode();
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
