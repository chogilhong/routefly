package kr.routefly.app;

import android.app.Activity;
import android.nfc.FormatException;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;

/**
 * NFC 스티커에 산악회 방 참가 링크 쓰기(2026-10-27 홍TV님 "앱에서 nfc 기능이 되도록").
 * 크롬은 Web NFC(NDEFReader)로 쓰지만 앱 웹뷰에는 Web NFC 가 없어, 앱이 직접 씁니다. party.js 가 앱 안이면 이것을 부름.
 * write({url}) - 30초 동안 스티커를 기다렸다가 주소 하나(URI 레코드)를 씀. 쓰는 동안은 읽기 모드라 폰이 스티커 주소를 열지 않음.
 * cancel() - 기다리기를 그만둠. 실패하면 reject 의 code: unsupported(NFC 없음) · off(꺼짐) · busy · timeout · cancelled · readonly · small · fail.
 */
@CapacitorPlugin(name = "RfNfc")
public class RfNfcPlugin extends Plugin {

    private static final long WAIT_MS = 30_000L;
    private final Handler main = new Handler(Looper.getMainLooper());
    private PluginCall pending;
    private NdefMessage message;
    private final Runnable timeout = () -> finish(null, "timeout");

    /** NFC 가 있는지 · 켜져 있는지(단추를 보일지 정할 때). */
    @PluginMethod
    public void status(PluginCall call) {
        NfcAdapter a = NfcAdapter.getDefaultAdapter(getContext());
        JSObject r = new JSObject();
        r.put("supported", a != null);
        r.put("enabled", a != null && a.isEnabled());
        call.resolve(r);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String url = call.getString("url");
        // routefly 산악회 방 참가 주소만(다른 주소를 스티커에 쓰지 않음)
        if (url == null || url.length() > 300 || !url.startsWith("https://routefly.kr/routefly/party.html?")) {
            call.reject("bad url", "fail");
            return;
        }
        NfcAdapter a = NfcAdapter.getDefaultAdapter(getContext());
        if (a == null) { call.reject("no nfc", "unsupported"); return; }
        if (!a.isEnabled()) { call.reject("nfc off", "off"); return; }
        Activity act = getActivity();
        synchronized (this) {
            if (pending != null) { call.reject("busy", "busy"); return; }
            pending = call;
            message = new NdefMessage(NdefRecord.createUri(url));
        }
        int flags = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F
                | NfcAdapter.FLAG_READER_NFC_V | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS;
        act.runOnUiThread(() -> a.enableReaderMode(act, this::onTag, flags, null));
        main.postDelayed(timeout, WAIT_MS);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        finish(null, "cancelled");
        call.resolve();
    }

    /** 스티커를 댐 - NFC 쪽 일꾼 스레드에서 불림. */
    private void onTag(Tag tag) {
        NdefMessage msg;
        synchronized (this) {
            if (pending == null) return;
            msg = message;
        }
        String err = null;
        try {
            Ndef ndef = Ndef.get(tag);
            if (ndef != null) {
                ndef.connect();
                try {
                    if (!ndef.isWritable()) err = "readonly";
                    else if (ndef.getMaxSize() < msg.toByteArray().length) err = "small";
                    else ndef.writeNdefMessage(msg);
                } finally {
                    ndef.close();
                }
            } else {
                NdefFormatable f = NdefFormatable.get(tag);   // 처음 쓰는 빈 스티커
                if (f == null) err = "fail";
                else {
                    f.connect();
                    try { f.format(msg); } finally { f.close(); }
                }
            }
        } catch (IOException | FormatException | RuntimeException e) {
            err = "fail";
        }
        finish(err == null ? "ok" : null, err);
    }

    /** 끝 - 읽기 모드를 풀고 기다리던 부름에 답함(한 번만). */
    private void finish(String ok, String code) {
        PluginCall c;
        synchronized (this) {
            c = pending;
            pending = null;
            message = null;
        }
        main.removeCallbacks(timeout);
        Activity act = getActivity();
        NfcAdapter a = NfcAdapter.getDefaultAdapter(getContext());
        if (act != null && a != null) act.runOnUiThread(() -> {
            try { a.disableReaderMode(act); } catch (RuntimeException e) { /* 이미 풀림 */ }
        });
        if (c == null) return;
        if (ok != null) c.resolve();
        else c.reject(code, code);
    }

    /** 화면을 떠나면 기다리기를 그만둠(읽기 모드는 화면이 앞에 있을 때만 됨). */
    @Override
    protected void handleOnPause() {
        finish(null, "cancelled");
        super.handleOnPause();
    }
}
