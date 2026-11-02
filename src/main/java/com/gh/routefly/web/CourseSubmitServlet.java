package com.gh.routefly.web;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 코스 보내기(2026-11-01 홍TV님 "등산객이 GPX 를 보내 주면 없는 코스면 점검해서 올림 - 보낸 사람 이름을 코스 이름 앞에").
 * <ul>
 *   <li>POST /api/course-submit {name, sender, kind, note, gpx, agree:true} - 누구나. 받은 폴더(course.submitDir, 기본 /opt/routefly/course-submit)에
 *       s-날짜-시각-여섯글자.gpx(점만 다시 씀 - 시각 · 사진 메모 없음) + .json(이름 · 보낸 사람 · 종류 · 메모 · 받은 시각 · 점 수 · 길이)</li>
 *   <li>GET /api/course-submit/list · GET /api/course-submit/gpx?id= · POST /api/course-submit/done {id} - 운영자 기기만(GPX 편집 화면이 점검 · 올리기 · 버리기)</li>
 * </ul>
 * 한도: 한 곳(IPv6 는 /48)에서 하루 3번, 서버 전체 하루 200번(먼저 자리 잡고 실패하면 돌려줌). 30일 지난 것은 목록 · 받기 때 지우고, 파일이 500개 · 합쳐 200MB 면 더 받지 않음.
 * 점은 모양을 지키며 1만 개까지 줄여 남김(2026-11-02 홍TV님 점검: 5만 점 · 3.5MB 짜리 500개면 0.9GB 였음).
 */
@WebServlet(urlPatterns = {"/api/course-submit", "/api/course-submit/*"})
public class CourseSubmitServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String DEFAULT_DIR = "/opt/routefly/course-submit";
    static final int MAX_FILES = 500, SENDER_MAX = 20, NOTE_MAX = 200;
    /** 남기는 점 수 상한 · 받은 폴더 크기 상한(2026-11-02 홍TV님 점검). */
    static final int KEEP_POINTS = 10_000;
    static final long MAX_BYTES = 200L * 1024 * 1024;
    static final long KEEP_MS = 30L * 24 * 3600_000L;
    static final Pattern ID = Pattern.compile("s-\\d{8}-\\d{6}-[0-9a-f]{6}");
    /** 보내기: 한 곳(IPv6 는 /48)에서 하루 3번(2026-11-02 홍TV님 점검: 5번이면 40곳이 서버 전체 하루 200번을 다 썼음). */
    static final PartyServlet.Quota SUBMITS = new PartyServlet.Quota(3, 24 * 3600_000L);
    /** 보내기: 서버 전체 하루 200번(주소를 바꿔 가며 채우기 막기). */
    static final PartyServlet.Quota SUBMITS_ALL = new PartyServlet.Quota(200, 24 * 3600_000L);
    private static final SecureRandom RND = new SecureRandom();
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.of("Asia/Seoul"));

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        if (!"/list".equals(path) && !"/gpx".equals(path)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        if (!PartyServlet.owner(req)) { Json.fail(resp, 403, "관리자 기기에서만 쓸 수 있습니다."); return; }
        File dir = dir();
        if (!dir.isDirectory()) { Json.fail(resp, 503, "받은 코스 폴더가 없습니다(설정 필요)."); return; }
        try {
            JsonObject o = new JsonObject();
            o.addProperty("success", true);
            if ("/list".equals(path)) {
                o.add("items", list(dir, System.currentTimeMillis()));
            } else {
                String id = req.getParameter("id");
                if (!validId(id)) { Json.fail(resp, 400, "요청을 읽지 못했습니다."); return; }
                File f = new File(dir, id + ".gpx");
                if (!f.isFile()) { Json.fail(resp, 404, "이미 지웠거나 없는 코스입니다."); return; }
                o.addProperty("id", id);
                o.addProperty("gpx", Files.readString(f.toPath(), StandardCharsets.UTF_8));
            }
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "읽지 못했습니다.");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo();
        boolean done = "/done".equals(path);
        if (!done && path != null && !path.isEmpty() && !"/".equals(path)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        if (done && !PartyServlet.owner(req)) { Json.fail(resp, 403, "관리자 기기에서만 쓸 수 있습니다."); return; }
        // JSON 으로 보낸 것만(다른 누리집이 손님 브라우저로 몰래 보내는 text/plain 글을 막음)
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase(Locale.ROOT).startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        File dir = dir();
        if (!dir.isDirectory()) { Json.fail(resp, 503, "지금은 코스를 받을 수 없습니다. 나중에 다시 보내 주세요."); return; }
        if (done) {
            JsonObject in = CourseUploadServlet.body(req, resp);
            if (in == null) return;
            String id = CourseUploadServlet.str(in, "id");
            if (!validId(id)) { Json.fail(resp, 400, "요청을 읽지 못했습니다."); return; }
            JsonObject o = new JsonObject();
            o.addProperty("success", true);
            o.addProperty("removed", remove(dir, id));
            Json.write(resp, 200, o, false);
            return;
        }
        // 한도는 먼저 자리 잡기 - 실패하면 돌려줌(PartyServlet 방 만들기와 같은 방식, /48 로 묶음)
        String key = quotaKey(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        long now = System.currentTimeMillis();
        if (!PartyServlet.reserve(SUBMITS, key, SUBMITS_ALL, now)) { Json.fail(resp, 429, "오늘은 더 보낼 수 없습니다. 내일 다시 보내 주세요."); return; }
        boolean ok = false;
        try {
            JsonObject in = CourseUploadServlet.body(req, resp);
            if (in == null) return;
            String name = CourseUploadServlet.str(in, "name"), kind = CourseUploadServlet.str(in, "kind");
            String sender = clean(CourseUploadServlet.str(in, "sender")), note = clean(CourseUploadServlet.str(in, "note"));
            List<double[]> pts = CourseUploadServlet.points(CourseUploadServlet.str(in, "gpx"));
            String why = !in.has("agree") || !in.get("agree").isJsonPrimitive() || !in.get("agree").getAsJsonPrimitive().isBoolean() || !in.get("agree").getAsBoolean()
                    ? "안내를 읽고 동의에 체크해 주세요." : check(sender, note);
            if (why == null) why = CourseUploadServlet.check(name, kind, pts);
            if (why != null) { Json.fail(resp, 400, why); return; }
            sweep(dir, now);
            if (count(dir) >= MAX_FILES || bytes(dir) >= MAX_BYTES) { Json.fail(resp, 503, "받은 코스가 많아 잠시 받지 않습니다. 며칠 뒤 다시 보내 주세요."); return; }
            JsonObject meta = save(dir, name.trim(), sender, kind, note, simplify(pts, KEEP_POINTS), now);
            if (meta == null) { Json.fail(resp, 409, "잠시 뒤 다시 보내 주세요."); return; }
            ok = true;
            JsonObject o = new JsonObject();
            o.addProperty("success", true);
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "보내지 못했습니다. 잠시 뒤 다시 보내 주세요.");
        } finally {
            if (!ok) { SUBMITS.give(key, now); SUBMITS_ALL.give("*", now); }
        }
    }

    private static File dir() {
        String d = RouteflyConfig.get("course.submitDir");
        return new File(d == null || d.isBlank() ? DEFAULT_DIR : d.trim());
    }

    /** 순수 함수 - 한도를 세는 묶음(IPv4 그대로, IPv6 는 /48 - 집 하나가 받는 주소 안에서 바꿔 가며 채우기 막기). */
    static String quotaKey(String ip) {
        return PartyServlet.missKey(RateLimiter.group(ip));
    }

    /** 순수 함수 - 보낸 사람 이름 · 메모 다듬기: 꺾쇠 · 따옴표 · &amp; · 제어 글자를 빼고 빈칸을 하나로. null 이면 "". */
    static String clean(String s) {
        return s == null ? "" : s.replaceAll("[<>\"'`&\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
    }

    /** 순수 함수 - 다듬은 보낸 사람 이름(비우면 익명, 20자까지) · 메모(200자까지)를 받을지(받으면 null). */
    static String check(String sender, String note) {
        if (sender.codePointCount(0, sender.length()) > SENDER_MAX) return "보내는 사람 이름은 20자 안으로 적어 주세요.";
        if (note.codePointCount(0, note.length()) > NOTE_MAX) return "메모는 200자 안으로 적어 주세요.";
        return null;
    }

    /** 순수 함수 - 받은 코스 번호 꼴(s-날짜-시각-여섯글자)만 - 폴더 밖 파일(../ 등)을 가리킬 수 없게. */
    static boolean validId(String id) {
        return id != null && ID.matcher(id).matches();
    }

    /** 점만 다시 쓴 GPX 와 정보(.json)를 씀 - 이 계정만 읽게(POSIX), 임시 파일에 쓴 뒤 옮김. 같은 번호가 있으면 null. */
    static JsonObject save(File dir, String name, String sender, String kind, String note, List<double[]> pts, long now) throws IOException {
        String id = "s-" + STAMP.format(Instant.ofEpochMilli(now)) + "-" + String.format("%06x", RND.nextInt(1 << 24));
        File gpx = new File(dir, id + ".gpx"), json = new File(dir, id + ".json");
        if (gpx.exists() || json.exists()) return null;
        double len = 0;
        for (int i = 1; i < pts.size(); i++) len += CourseUploadServlet.distM(pts.get(i - 1), pts.get(i));
        JsonObject m = new JsonObject();
        m.addProperty("id", id);
        m.addProperty("name", name);
        m.addProperty("sender", sender);
        m.addProperty("kind", kind);
        m.addProperty("note", note);
        m.addProperty("at", now);
        m.addProperty("points", pts.size());
        m.addProperty("distM", Math.round(len));
        put(dir, gpx, CourseUploadServlet.gpx(name, kind, pts));
        put(dir, json, m.toString());   // 정보가 마지막 - 목록은 .json 이 있는 것만 보임
        return m;
    }

    private static void put(File dir, File out, String text) throws IOException {
        File tmp = new File(dir, "." + out.getName() + ".tmp");
        Files.write(tmp.toPath(), text.getBytes(StandardCharsets.UTF_8));
        CourseUploadServlet.perms(tmp.toPath(), "rw-------");
        Files.move(tmp.toPath(), out.toPath(), StandardCopyOption.ATOMIC_MOVE);
    }

    /** 받은 것 목록(새것 먼저) - 30일 지난 것은 먼저 지움. 정보 파일을 못 읽으면 그것만 뺌. */
    static JsonArray list(File dir, long now) {
        sweep(dir, now);
        List<String> ids = new ArrayList<>();
        String[] names = dir.list();
        if (names != null) for (String n : names) if (n.endsWith(".json") && validId(n.substring(0, n.length() - 5))) ids.add(n.substring(0, n.length() - 5));
        ids.sort(java.util.Comparator.reverseOrder());
        JsonArray out = new JsonArray();
        for (String id : ids) {
            try {
                if (!new File(dir, id + ".gpx").isFile()) continue;
                out.add(JsonParser.parseString(Files.readString(new File(dir, id + ".json").toPath(), StandardCharsets.UTF_8)).getAsJsonObject());
            } catch (Exception e) {
                // 그 하나만 뺌
            }
        }
        return out;
    }

    /** 점검을 마친 것(올렸거나 버림) - 두 파일을 지움. 하나라도 지웠으면 true. */
    static boolean remove(File dir, String id) {
        boolean a = new File(dir, id + ".gpx").delete(), b = new File(dir, id + ".json").delete();
        return a || b;
    }

    /** 30일 지난 파일(받은 코스 · 남은 임시 파일)을 지움 - 지운 수. */
    static int sweep(File dir, long now) {
        File[] fs = dir.listFiles();
        int n = 0;
        if (fs != null) for (File f : fs) if (f.isFile() && now - f.lastModified() > KEEP_MS && f.getName().matches("\\.?s-[0-9a-f-]+\\.(gpx|json)(\\.tmp)?") && f.delete()) n++;
        return n;
    }

    /** 받은 폴더 파일 크기 합. */
    static long bytes(File dir) {
        File[] fs = dir.listFiles();
        long n = 0;
        if (fs != null) for (File f : fs) if (f.isFile()) n += f.length();
        return n;
    }

    /**
     * 순수 함수 - 점 [위도, 경도, 높이] 를 모양을 지키며 max 개 안으로(더글러스-포이커, 처음 · 끝은 늘). 이미 max 안이면 그대로.
     * 1m 어긋남부터 두 배씩 늘려 max 안에 들 때까지(2026-11-02 홍TV님 점검 - 받은 폴더 크기).
     */
    static List<double[]> simplify(List<double[]> pts, int max) {
        if (pts.size() <= max) return pts;
        double lat0 = Math.toRadians(pts.get(0)[0]), ky = 111_320.0, kx = ky * Math.cos(lat0);
        double[] xs = new double[pts.size()], ys = new double[pts.size()];
        for (int i = 0; i < xs.length; i++) { xs[i] = pts.get(i)[1] * kx; ys[i] = pts.get(i)[0] * ky; }
        for (double tol = 1; ; tol *= 2) {
            boolean[] keep = new boolean[xs.length];
            keep[0] = keep[xs.length - 1] = true;
            java.util.ArrayDeque<int[]> st = new java.util.ArrayDeque<>();
            st.push(new int[] {0, xs.length - 1});
            int kept = 2;
            while (!st.isEmpty() && kept <= max) {
                int[] r = st.pop();
                int a = r[0], b = r[1], far = -1;
                double dx = xs[b] - xs[a], dy = ys[b] - ys[a], len = Math.hypot(dx, dy), worst = tol;
                for (int i = a + 1; i < b; i++) {
                    double d = len == 0 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs(dy * (xs[i] - xs[a]) - dx * (ys[i] - ys[a])) / len;
                    if (d > worst) { worst = d; far = i; }
                }
                if (far < 0) continue;
                keep[far] = true;
                kept++;
                st.push(new int[] {a, far});
                st.push(new int[] {far, b});
            }
            if (kept > max) continue;
            List<double[]> out = new ArrayList<>(kept);
            for (int i = 0; i < keep.length; i++) if (keep[i]) out.add(pts.get(i));
            return out;
        }
    }

    private static int count(File dir) {
        String[] names = dir.list();
        return names == null ? 0 : names.length;
    }
}
