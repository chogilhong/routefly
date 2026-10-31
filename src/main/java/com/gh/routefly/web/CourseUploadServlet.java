package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 내 기록 → 코스로 올리기(2026-10-31 홍TV님 "이 기록을 코스로 올리기 - 일단 나만 보이게"). 운영자 기기(/stats 쿠키)만.
 * <ul>
 *   <li>GET /api/course-upload → {owner} - 화면이 단추를 보일지</li>
 *   <li>POST /api/course-upload {name, kind, gpx} → 올림 폴더(course.inboxDir, 기본 /opt/routefly/course-inbox)의 kind/u-날짜-시각.gpx
 *       - routefly-batch courseImport 가 매시 :07 에 읽어 코스로(높이는 지형 자료로 다시)</li>
 * </ul>
 * 받은 GPX 는 그대로 두지 않고 점(위도 · 경도 · 높이)만 다시 써 시각 · 사진 메모는 남기지 않습니다.
 */
@WebServlet(urlPatterns = {"/api/course-upload"})
public class CourseUploadServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final int MAX_BODY = 3 * 1024 * 1024, MIN_POINTS = 10, MAX_POINTS = 50_000;
    static final String DEFAULT_DIR = "/opt/routefly/course-inbox";
    private static final Pattern TRKPT = Pattern.compile("<trkpt\\b([^>]*)>(.*?)</trkpt>|<trkpt\\b([^>]*)/>", Pattern.DOTALL);
    private static final Pattern LAT = Pattern.compile("\\blat\\s*=\\s*\"(-?\\d{1,3}(?:\\.\\d+)?)\""), LON = Pattern.compile("\\blon\\s*=\\s*\"(-?\\d{1,3}(?:\\.\\d+)?)\"");
    private static final Pattern ELE = Pattern.compile("<ele>\\s*(-?\\d{1,5}(?:\\.\\d+)?)\\s*</ele>");

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("owner", PartyServlet.owner(req));
        Json.write(resp, 200, o, false);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!PartyServlet.owner(req)) { Json.fail(resp, 403, "관리자 기기에서만 쓸 수 있습니다."); return; }
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase(Locale.ROOT).startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        JsonObject in;
        try {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            BufferedReader r = req.getReader();
            for (int n; (n = r.read(buf)) > 0;) {
                sb.append(buf, 0, n);
                if (sb.length() > MAX_BODY) { Json.fail(resp, 413, "GPX 가 너무 큽니다."); return; }
            }
            in = JsonParser.parseString(sb.toString()).getAsJsonObject();
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        String dirName = RouteflyConfig.get("course.inboxDir");
        File dir = new File(dirName == null || dirName.isBlank() ? DEFAULT_DIR : dirName.trim());
        if (!dir.isDirectory()) { Json.fail(resp, 503, "서버에 올림 폴더가 없습니다(설정 필요)."); return; }
        try {
            String name = str(in, "name"), kind = str(in, "kind");
            List<double[]> pts = points(str(in, "gpx"));
            String why = check(name, kind, pts);
            if (why != null) { Json.fail(resp, 400, why); return; }
            String id = "u-" + ZonedDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
            File kd = new File(dir, kind);
            if (!kd.isDirectory() && !kd.mkdir()) { Json.fail(resp, 500, "올림 폴더를 만들지 못했습니다."); return; }
            perms(kd.toPath(), "rwxr-x---");   // 배치(routefly 묶음)가 읽게 - 묶음은 폴더의 setgid(2750)로 이어짐
            File out = new File(kd, id + ".gpx"), tmp = new File(kd, "." + id + ".tmp");
            if (out.exists()) { Json.fail(resp, 409, "잠시 뒤 다시 올려 주세요."); return; }
            Files.write(tmp.toPath(), gpx(name.trim(), kind, pts).getBytes(StandardCharsets.UTF_8));
            perms(tmp.toPath(), "rw-r-----");
            Files.move(tmp.toPath(), out.toPath(), StandardCopyOption.ATOMIC_MOVE);
            JsonObject o = new JsonObject();
            o.addProperty("success", true);
            o.addProperty("id", id);
            o.addProperty("points", pts.size());
            Json.write(resp, 200, o, false);
        } catch (Exception e) {
            Json.fail(resp, 500, "올리지 못했습니다.");
        }
    }

    private static void perms(java.nio.file.Path p, String rwx) {
        try {
            Files.setPosixFilePermissions(p, java.nio.file.attribute.PosixFilePermissions.fromString(rwx));
        } catch (Exception e) {
            // 윈도우(PC 개발) - 그대로
        }
    }

    private static String str(JsonObject o, String k) {
        return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString() : null;
    }

    /** 순수 함수 - GPX 글 → 점 [위도, 경도, 높이(없으면 NaN)]. 속성 순서 · 높이 없는 점 · 빈 태그(<trkpt …/>)도. */
    static List<double[]> points(String gpx) {
        List<double[]> out = new ArrayList<>();
        if (gpx == null) return out;
        Matcher m = TRKPT.matcher(gpx);
        while (m.find() && out.size() <= MAX_POINTS) {
            String attrs = m.group(1) != null ? m.group(1) : m.group(3), body = m.group(2) == null ? "" : m.group(2);
            Matcher la = LAT.matcher(attrs), lo = LON.matcher(attrs);
            if (!la.find() || !lo.find()) continue;
            Matcher e = ELE.matcher(body);
            out.add(new double[] {Double.parseDouble(la.group(1)), Double.parseDouble(lo.group(1)), e.find() ? Double.parseDouble(e.group(1)) : Double.NaN});
        }
        return out;
    }

    /** 순수 함수 - 받을지(받으면 null, 아니면 까닭). 이름 2~60자 · 종류 hike/walk/bike · 점 10개 이상 · 한국 안 · 300m 이상. */
    static String check(String name, String kind, List<double[]> pts) {
        if (name == null || name.trim().length() < 2 || name.trim().length() > 60) return "코스 이름은 2~60자로 적어 주세요.";
        if (name.matches(".*[<>&\\p{Cntrl}].*")) return "코스 이름에 쓸 수 없는 글자가 있습니다.";
        if (kind == null || !kind.matches("hike|walk|bike")) return "종류가 맞지 않습니다.";
        if (pts.size() < MIN_POINTS) return "기록 점이 너무 적습니다.";
        if (pts.size() > MAX_POINTS) return "기록 점이 너무 많습니다.";
        double len = 0;
        for (int i = 0; i < pts.size(); i++) {
            double[] p = pts.get(i);
            if (p[0] < 33 || p[0] > 39 || p[1] < 124 || p[1] > 132) return "한국 밖 점이 있습니다.";
            if (i > 0) len += distM(pts.get(i - 1), p);
        }
        return len < 300 ? "기록이 너무 짧습니다(300m 미만)." : null;
    }

    /** 순수 함수 - 점만 다시 쓴 GPX(시각 · 사진 메모 없음). */
    static String gpx(String name, String kind, List<double[]> pts) {
        StringBuilder sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"routefly upload\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n<trk><name>")
                .append(name).append("</name><type>").append(kind).append("</type><trkseg>\n");
        for (double[] p : pts) {
            sb.append("<trkpt lat=\"").append(p[0]).append("\" lon=\"").append(p[1]).append("\">");
            if (!Double.isNaN(p[2])) sb.append("<ele>").append(Math.round(p[2])).append("</ele>");
            sb.append("</trkpt>\n");
        }
        return sb.append("</trkseg></trk>\n</gpx>\n").toString();
    }

    private static double distM(double[] a, double[] b) {
        double kx = 111320 * Math.cos(Math.toRadians((a[0] + b[0]) / 2)), ky = 110540;
        return Math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * ky);
    }
}
