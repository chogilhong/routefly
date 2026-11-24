package com.gh.routefly.web;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 공개 기록 링크 보기(2026-11-22 홍TV님 - 유튜버들이 영상 설명란에 코스 · 루트 링크를 넣음).
 * 만들기 · 공개 끄기 단추는 2026-11-22 홍TV님이 화면에서 뺐고, 서버의 만들기 · 끄기 입구(POST)도 점검 14차(2026-11-24)에 지움 -
 * 부르는 화면이 없는데 누구나 우리 주소로 글 · 선을 올릴 수 있었음. 이미 만든 링크 보기만 남음.
 * <ul>
 *   <li>GET /api/record-share?id= - 누구나(record.html 이 그림). 열쇠 지문은 내보내지 않음. 만든 지 1년이 지났으면 그 자리에서 지우고 404.</li>
 * </ul>
 * 폴더는 설정 record.shareDir(기본 /opt/routefly/record-share). 1년 지난 것은 보기 요청 때 한 시간에 한 번 훑어 지움(개인정보처리방침 "1년이면 자동으로 지움" -
 * 예전에는 만들 때만 훑어 만들기를 뺀 뒤로 돌지 않았음, 점검 14차 A2). 지우고 싶으면 방침의 연락처로 요청.
 */
@WebServlet(urlPatterns = {"/api/record-share", "/api/record-share/*"})
public class RecordShareServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String DEFAULT_DIR = "/opt/routefly/record-share";
    static final long KEEP_MS = 365L * 24 * 3600_000L, SWEEP_MS = 3600_000L;
    static final Pattern ID = Pattern.compile("[0-9A-Za-z]{10}");
    private static volatile long lastSweep;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo(), id = req.getParameter("id");
        if (path != null && !path.isEmpty() && !"/".equals(path)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        if (id == null || !ID.matcher(id).matches()) { Json.fail(resp, 400, "요청을 읽지 못했습니다."); return; }
        long now = System.currentTimeMillis();
        File dir = dir();
        if (now - lastSweep > SWEEP_MS && dir.isDirectory()) { lastSweep = now; sweep(dir, now); }
        File f = new File(dir, id + ".json");
        if (!f.isFile()) { Json.fail(resp, 404, "공개를 끈 기록이거나 없는 링크입니다."); return; }
        try {
            JsonObject o = JsonParser.parseString(Files.readString(f.toPath(), StandardCharsets.UTF_8)).getAsJsonObject();
            if (expired(o, now)) { Files.deleteIfExists(f.toPath()); Json.fail(resp, 404, "공개를 끈 기록이거나 없는 링크입니다."); return; }
            o.remove("keyHash");
            o.addProperty("success", true);
            o.addProperty("id", id);
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "읽지 못했습니다.");
        }
    }

    /** 순수 함수 - 만든 지 1년이 지났는가(만든 때 - 파일 시각이 아니라 안의 created). created 가 없으면 지나지 않은 것으로. */
    static boolean expired(JsonObject o, long now) {
        try {
            return o.has("created") && now - o.get("created").getAsLong() > KEEP_MS;
        } catch (Exception e) {
            return false;
        }
    }

    /** 1년 지난 공개 기록을 지움. */
    static int sweep(File dir, long now) {
        int n = 0;
        File[] all = dir.listFiles((d, x) -> x.endsWith(".json"));
        for (File f : all == null ? new File[0] : all) {
            try {
                if (expired(JsonParser.parseString(Files.readString(f.toPath(), StandardCharsets.UTF_8)).getAsJsonObject(), now) && f.delete()) n++;
            } catch (Exception e) {
                // 깨진 파일 - 그대로(운영자가 봄)
            }
        }
        return n;
    }

    static File dir() {
        String d = RouteflyConfig.get("record.shareDir");
        return new File(d == null || d.isBlank() ? DEFAULT_DIR : d.trim());
    }
}
