package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 공개 기록 링크(2026-11-22 홍TV님 - 유튜버들이 영상 설명란에 코스 · 루트 링크를 넣음). 따라가기 "📒 내 기록 → 📈 → 🎬 영상용 → 🔗 공개 기록 링크" 를
 * 본인이 누를 때만 받습니다.
 * <ul>
 *   <li>POST /api/record-share {name, kind, date, dist_m, time_ms, up_m, track:[[위도, 경도, 높이|null]]} → {id, key} - 화면이 처음 · 끝 300m 를 잘라 보냄(집 · 주차한 곳).
 *       시각 · 사진 · 메모는 받지 않음. 지우는 열쇠(key)는 그 기기에만 - 서버에는 SHA-256 만.</li>
 *   <li>GET /api/record-share?id= - 누구나(record.html 이 그림). 열쇠 지문은 내보내지 않음.</li>
 *   <li>POST /api/record-share/delete {id, key} - 그 기기의 "공개 끄기" - 바로 지움.</li>
 * </ul>
 * 폴더는 설정 record.shareDir(기본 /opt/routefly/record-share). 1년 지난 것은 만들 때 지움(한 시간에 한 번 훑음). 한 곳(IPv6 는 /48)에서 하루 10번, 서버 전체 하루 500번,
 * 파일 2만 개 · 합쳐 300MB 까지. 운영자 서버에 남는 것은 길 모양과 숫자뿐이라 IP 주소 등과 잇지 않습니다(한도는 메모리에 하루만).
 */
@WebServlet(urlPatterns = {"/api/record-share", "/api/record-share/*"})
public class RecordShareServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String DEFAULT_DIR = "/opt/routefly/record-share";
    static final int MAX_BODY = 400_000, MIN_POINTS = 2, MAX_POINTS = 4000, NAME_MAX = 40, MAX_FILES = 20_000;
    static final long MAX_BYTES = 300L * 1024 * 1024, KEEP_MS = 365L * 24 * 3600_000L, SWEEP_MS = 3600_000L;
    static final Pattern ID = Pattern.compile("[0-9A-Za-z]{10}"), KEY = Pattern.compile("[0-9a-f]{32}"), DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    static final PartyServlet.Quota SHARES = new PartyServlet.Quota(10, 24 * 3600_000L);
    static final PartyServlet.Quota SHARES_ALL = new PartyServlet.Quota(500, 24 * 3600_000L);
    private static final SecureRandom RND = new SecureRandom();
    private static final String ABC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static volatile long lastSweep;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo(), id = req.getParameter("id");
        if (path != null && !path.isEmpty() && !"/".equals(path)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        if (id == null || !ID.matcher(id).matches()) { Json.fail(resp, 400, "요청을 읽지 못했습니다."); return; }
        File f = new File(dir(), id + ".json");
        if (!f.isFile()) { Json.fail(resp, 404, "공개를 끈 기록이거나 없는 링크입니다."); return; }
        try {
            JsonObject o = JsonParser.parseString(Files.readString(f.toPath(), StandardCharsets.UTF_8)).getAsJsonObject();
            o.remove("keyHash");
            o.addProperty("success", true);
            o.addProperty("id", id);
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "읽지 못했습니다.");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        boolean del = "/delete".equals(path);
        if (!del && path != null && !path.isEmpty() && !"/".equals(path)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        // JSON 으로 보낸 것만(다른 누리집이 손님 브라우저로 몰래 보내는 text/plain 글을 막음 - 코스 보내기와 같음)
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase(Locale.ROOT).startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        File dir = dir();
        if (!dir.isDirectory()) { Json.fail(resp, 503, "지금은 공개 링크를 만들 수 없습니다. 나중에 다시 해 주세요."); return; }
        if (del) {
            JsonObject in = body(req, resp);
            if (in == null) return;
            String id = CourseUploadServlet.str(in, "id"), key = CourseUploadServlet.str(in, "key");
            if (id == null || !ID.matcher(id).matches() || key == null || !KEY.matcher(key).matches()) { Json.fail(resp, 400, "요청을 읽지 못했습니다."); return; }
            File f = new File(dir, id + ".json");
            if (f.isFile()) {
                try {
                    JsonObject o = JsonParser.parseString(Files.readString(f.toPath(), StandardCharsets.UTF_8)).getAsJsonObject();
                    if (!MessageDigest.isEqual(hash(key).getBytes(StandardCharsets.US_ASCII), CourseUploadServlet.str(o, "keyHash").getBytes(StandardCharsets.US_ASCII))) {
                        Json.fail(resp, 403, "이 기기에서 만든 링크가 아닙니다."); return;
                    }
                    Files.deleteIfExists(f.toPath());
                } catch (Exception e) {
                    Json.fail(resp, 500, "지우지 못했습니다. 잠시 뒤 다시 해 주세요."); return;
                }
            }
            JsonObject o = new JsonObject();
            o.addProperty("success", true);   // 이미 없으면(1년 지남) 그대로 끝
            Json.write(resp, 200, o, false);
            return;
        }
        String qk = CourseSubmitServlet.quotaKey(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        long now = System.currentTimeMillis();
        if (!PartyServlet.reserve(SHARES, qk, SHARES_ALL, now)) { Json.fail(resp, 429, "오늘은 더 만들 수 없습니다. 내일 다시 해 주세요."); return; }
        boolean ok = false;
        try {
            JsonObject in = body(req, resp);
            if (in == null) return;
            JsonObject rec = clean(in);
            if (rec == null) { Json.fail(resp, 400, "기록을 읽지 못했습니다."); return; }
            if (now - lastSweep > SWEEP_MS) { lastSweep = now; sweep(dir, now); }
            File[] all = dir.listFiles((d, n) -> n.endsWith(".json"));
            long bytes = 0;
            for (File f : all == null ? new File[0] : all) bytes += f.length();
            if (all != null && (all.length >= MAX_FILES || bytes >= MAX_BYTES)) { Json.fail(resp, 503, "공개 기록이 많아 잠시 받지 않습니다. 며칠 뒤 다시 해 주세요."); return; }
            String id = null, key = token();
            for (int i = 0; i < 5 && id == null; i++) { String c = id(); if (!new File(dir, c + ".json").exists()) id = c; }
            if (id == null) { Json.fail(resp, 409, "잠시 뒤 다시 해 주세요."); return; }
            rec.addProperty("created", now);
            rec.addProperty("keyHash", hash(key));
            PrivateFile.write(new File(dir, id + ".json").toPath(), rec.toString());
            ok = true;
            JsonObject o = new JsonObject();
            o.addProperty("success", true);
            o.addProperty("id", id);
            o.addProperty("key", key);
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "만들지 못했습니다. 잠시 뒤 다시 해 주세요.");
        } finally {
            if (!ok) { SHARES.give(qk, now); SHARES_ALL.give("*", now); }
        }
    }

    /**
     * 순수 함수 - 받은 글에서 남길 것만 새로 만듦(모르는 칸 · 시각은 버림). 틀리면 null.
     * name 은 40자 · 줄바꿈 · 꺾쇠 없이, kind 는 hike · walk · bike, 점은 2 ~ 4000 개 [위도(소수 6자리), 경도, 높이(-500 ~ 9000 정수 | null)].
     */
    static JsonObject clean(JsonObject in) {
        String name = CourseUploadServlet.str(in, "name"), kind = CourseUploadServlet.str(in, "kind"), date = CourseUploadServlet.str(in, "date");
        if (name == null || (name = name.replaceAll("[\\p{Cntrl}<>]", " ").replaceAll("\\s+", " ").trim()).isEmpty()) return null;
        if (name.length() > NAME_MAX) name = name.substring(0, NAME_MAX);
        if (!"hike".equals(kind) && !"walk".equals(kind) && !"bike".equals(kind)) return null;
        if (date == null || !DATE.matcher(date).matches()) return null;
        Long dist = num(in, "dist_m", 0, 2_000_000), time = num(in, "time_ms", 0, 10L * 24 * 3600_000), up = num(in, "up_m", 0, 50_000);
        if (dist == null || time == null) return null;
        JsonElement t = in.get("track");
        if (t == null || !t.isJsonArray() || t.getAsJsonArray().size() < MIN_POINTS || t.getAsJsonArray().size() > MAX_POINTS) return null;
        JsonArray pts = new JsonArray();
        for (JsonElement e : t.getAsJsonArray()) {
            if (!e.isJsonArray() || e.getAsJsonArray().size() < 2) return null;
            JsonArray p = e.getAsJsonArray();
            double lat, lon;
            try { lat = p.get(0).getAsDouble(); lon = p.get(1).getAsDouble(); } catch (Exception x) { return null; }
            if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
            JsonArray q = new JsonArray();
            q.add(Math.round(lat * 1e6) / 1e6);
            q.add(Math.round(lon * 1e6) / 1e6);
            Double ele = null;
            try { if (p.size() > 2 && !p.get(2).isJsonNull()) ele = p.get(2).getAsDouble(); } catch (Exception x) { return null; }
            if (ele != null && ele >= -500 && ele <= 9000) q.add(Math.round(ele)); else q.add((Number) null);
            pts.add(q);
        }
        JsonObject o = new JsonObject();
        o.addProperty("name", name);
        o.addProperty("kind", kind);
        o.addProperty("date", date);
        o.addProperty("dist_m", dist);
        o.addProperty("time_ms", time);
        if (up != null) o.addProperty("up_m", up);
        o.add("track", pts);
        return o;
    }

    /** 순수 함수 - 정수 칸(lo ~ hi), 없거나 null 이면 null. 틀린 꼴이면 null. */
    private static Long num(JsonObject in, String k, long lo, long hi) {
        if (!in.has(k) || in.get(k).isJsonNull() || !in.get(k).isJsonPrimitive()) return null;
        try {
            double v = in.get(k).getAsDouble();
            return v >= lo && v <= hi ? Math.round(v) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 1년 지난 공개 기록을 지움(만든 때 - 파일 시각이 아니라 안의 created). */
    static int sweep(File dir, long now) {
        int n = 0;
        File[] all = dir.listFiles((d, x) -> x.endsWith(".json"));
        for (File f : all == null ? new File[0] : all) {
            try {
                JsonObject o = JsonParser.parseString(Files.readString(f.toPath(), StandardCharsets.UTF_8)).getAsJsonObject();
                if (o.has("created") && now - o.get("created").getAsLong() > KEEP_MS && f.delete()) n++;
            } catch (Exception e) {
                // 깨진 파일 - 그대로(운영자가 봄)
            }
        }
        return n;
    }

    private static JsonObject body(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        try {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            BufferedReader r = req.getReader();
            for (int n; (n = r.read(buf)) > 0;) {
                sb.append(buf, 0, n);
                if (sb.length() > MAX_BODY) { Json.fail(resp, 413, "기록이 너무 큽니다."); return null; }
            }
            return JsonParser.parseString(sb.toString()).getAsJsonObject();
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return null;
        }
    }

    static File dir() {
        String d = RouteflyConfig.get("record.shareDir");
        return new File(d == null || d.isBlank() ? DEFAULT_DIR : d.trim());
    }

    private static String id() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 10; i++) b.append(ABC.charAt(RND.nextInt(ABC.length())));
        return b.toString();
    }

    private static String token() {
        byte[] b = new byte[16];
        RND.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
