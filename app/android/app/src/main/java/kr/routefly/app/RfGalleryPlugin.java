package kr.routefly.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.annotation.RequiresApi;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

/**
 * 찍은 사진을 폰 갤러리(Pictures/routefly 앨범)에도 넣기(2026-11-01 홍TV님). hike.js 의 사진 · 메모가 앱 안이면 부름(설정 rf-gallery).
 * 앱 웹뷰의 카메라 사진은 앱 전용 폴더에 남아 갤러리에 안 보여, MediaStore 에 직접 넣습니다.
 * 안드로이드 10(API 29) 이상만 - RELATIVE_PATH 로 넣어 저장소 권한이 필요 없음. 그 아래는 reject(code old), 웹은 말없이 넘어감.
 * save({data: JPEG base64, name: "routefly-….jpg"}).
 */
@CapacitorPlugin(name = "RfGallery")
public class RfGalleryPlugin extends Plugin {

    private static final int MAX_B64 = 24_000_000;   // 원본 12MB 남짓까지(hike.js 가 넘으면 줄인 사진을 보냄)

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("android 10+ only", "old"); return; }
        String data = call.getString("data");
        String n = call.getString("name");
        if (data == null || data.isEmpty() || data.length() > MAX_B64) { call.reject("bad data", "fail"); return; }
        final String name = n != null && n.matches("[A-Za-z0-9_-]{1,80}\\.jpg") ? n : "routefly-" + System.currentTimeMillis() + ".jpg";
        final byte[] jpeg;
        try {
            jpeg = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("bad data", "fail");
            return;
        }
        final ContentResolver cr = getContext().getContentResolver();
        new Thread(() -> {   // 쓰기는 UI 밖에서
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) insert(cr, jpeg, name);
                call.resolve();
            } catch (IOException | RuntimeException e) {
                call.reject("save failed", "fail");
            }
        }).start();
    }

    /** MediaStore 에 넣기 - 다 쓸 때까지 IS_PENDING 으로 숨기고, 실패하면 만든 줄을 지움. */
    @RequiresApi(api = Build.VERSION_CODES.Q)
    private static void insert(ContentResolver cr, byte[] jpeg, String name) throws IOException {
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/routefly");
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri u = cr.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
        if (u == null) throw new IOException("insert failed");
        try (OutputStream o = cr.openOutputStream(u)) {
            if (o == null) throw new IOException("open failed");
            o.write(jpeg);
        } catch (IOException | RuntimeException e) {
            cr.delete(u, null, null);
            throw e;
        }
        v.clear();
        v.put(MediaStore.Images.Media.IS_PENDING, 0);
        cr.update(u, v, null, null);
    }
}
