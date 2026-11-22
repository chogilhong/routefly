package kr.routefly.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 카톡 · 파일 앱에서 "routefly 로 열기 · 공유" 한 GPX(2026-11-22 홍TV님 "폰, 시계 등으로도 gpx 를 만들어서 공유를 하더라고").
 * MainActivity 가 받은 GPX 글을 여기에 맡겨 두고, 따라가기 화면(hike.js rfGpxInbox)이 take() 로 한 번 가져가 엽니다(가져가면 비움).
 * take() → {name, text} 또는 {error}(GPX 가 아님 · 너무 큼 · 못 읽음), 맡긴 것이 없으면 {}.
 */
@CapacitorPlugin(name = "RfGpx")
public class RfGpxPlugin extends Plugin {

    private static String pendingName, pendingText, pendingError;

    /** MainActivity 가 부름 - 앞에 맡긴 것은 버림(가장 최근에 연 파일만). */
    static synchronized void put(String name, String text, String error) {
        pendingName = name;
        pendingText = text;
        pendingError = error;
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = new JSObject();
        synchronized (RfGpxPlugin.class) {
            if (pendingText != null) { r.put("name", pendingName); r.put("text", pendingText); }
            else if (pendingError != null) r.put("error", pendingError);
            pendingName = pendingText = pendingError = null;
        }
        call.resolve(r);
    }
}
