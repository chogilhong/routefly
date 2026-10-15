package com.gh.routefly.web;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import jakarta.servlet.ServletContext;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 100대 명산 정상의 공식 높이로 코스 높이 바로잡기(2026-10-16 홍TV님 - "대청봉 1,700m 를 1,708m 로, 정상 높이는 정확해야 신뢰").
 *
 * <p>코스 · 지점 높이는 지형 자료(DEM)라 정상이 몇 m 낮게 나옴. 정상(mountains100.json 좌표) 근처 지점의 높이와, 정상을 지나는 코스의 "최고" 높이를
 * data/peak-elev.json 의 공식 높이로 바꿔 보냄 - 3D · 따라가기 · 음성 · 산 페이지가 함께 맞춰짐.</p>
 */
final class Peaks {

    private Peaks() {
    }

    /** 지점(이름표)이 정상에서 이 안이면 그 정상의 높이로(m). */
    static final double POI_M = 300;
    /** 코스 점이 정상에서 이 안이면 그 정상을 지나는 코스(m). */
    static final double PASS_M = 200;
    /** 지형 자료 최고점과 공식 높이가 이보다 많이 다르면 바꾸지 않음(그 산 아닌 다른 높은 곳을 지나는 코스 - m). */
    static final double MAX_DIFF_M = 80;

    private static volatile List<double[]> tops;

    /** 공식 높이가 있는 정상 [위도, 경도, 높이] - 웹 앱의 data 파일에서 한 번 읽음. 못 읽으면 빈 것. */
    static List<double[]> tops(ServletContext ctx) {
        List<double[]> t = tops;
        if (t != null) return t;
        JsonArray peaks = new JsonArray();
        try (InputStream in = ctx.getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            if (e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks")) peaks = e.getAsJsonObject().getAsJsonArray("peaks");
        } catch (Exception e) {
            // 정상 없이 - 높이는 지형 자료 그대로
        }
        MountainServlet.withElev(peaks, MountainServlet.readElev(ctx));
        t = Collections.unmodifiableList(tops(peaks));
        tops = t;
        return t;
    }

    /** 순수 함수 - 공식 높이(elev)가 있는 정상만 [위도, 경도, 높이]. */
    static List<double[]> tops(JsonArray peaks) {
        List<double[]> out = new ArrayList<>();
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            Integer h = MountainServlet.elev(o);
            if (h != null && o.has("lat") && o.has("lon")) out.add(new double[] {o.get("lat").getAsDouble(), o.get("lon").getAsDouble(), h});
        }
        return out;
    }

    /** 순수 함수 - (lat, lon) 에서 maxM 안의 가장 가까운 정상 높이, 없으면 null. */
    static Integer near(List<double[]> tops, double lat, double lon, double maxM) {
        double best = maxM;
        Integer h = null;
        for (double[] t : tops) {
            if (Math.abs(t[0] - lat) > 0.01 || Math.abs(t[1] - lon) > 0.013) continue;   // 1km 밖은 셈하지 않음
            double d = MountainServlet.distM(lat, lon, t[0], t[1]);
            if (d <= best) {
                best = d;
                h = (int) t[2];
            }
        }
        return h;
    }

    /**
     * 순수 함수 - 선분(a → b, [위도, 경도])에서 maxM 안을 지나는 정상 가운데 가장 높은 것의 높이, 없으면 null.
     * 코스 점은 솎아져 있어 점과 점 사이로 정상을 지날 수 있음 - 점만 보면 놓쳤음(2026-10-16).
     */
    static Integer passing(List<double[]> tops, double aLat, double aLon, double bLat, double bLon, double maxM) {
        Integer best = null;
        double kx = 111320 * Math.cos(Math.toRadians((aLat + bLat) / 2)), ky = 110540;
        for (double[] t : tops) {
            if (t[0] < Math.min(aLat, bLat) - 0.01 || t[0] > Math.max(aLat, bLat) + 0.01 || t[1] < Math.min(aLon, bLon) - 0.013 || t[1] > Math.max(aLon, bLon) + 0.013) continue;
            double ax = (aLon - t[1]) * kx, ay = (aLat - t[0]) * ky, bx = (bLon - t[1]) * kx, by = (bLat - t[0]) * ky;
            double dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
            double f = len2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
            double px = ax + f * dx, py = ay + f * dy;
            if (Math.sqrt(px * px + py * py) <= maxM && (best == null || t[2] > best)) best = (int) t[2];
        }
        return best;
    }

    /** 순수 함수 - 지형 자료 최고점(demMax)과 지나는 정상들의 공식 높이 → 화면 "최고" 높이. 지나는 정상이 없거나 너무 다르면 null(그대로). */
    static Integer courseTop(Double demMax, List<Integer> passed) {
        Integer best = null;
        for (Integer h : passed) if (best == null || h > best) best = h;
        if (best == null || demMax == null || Math.abs(best - demMax) > MAX_DIFF_M) return null;
        return best;
    }

    /**
     * 순수 함수 - /api/course 응답 고치기: 정상 근처 지점의 ele_m 을 공식 높이로(+ ele_official), 정상을 지나면 course.ele_max_m 도.
     * points 는 [경도, 위도, 고도, 누적 거리].
     */
    static void applyDetail(JsonObject detail, List<double[]> tops) {
        if (detail == null || tops.isEmpty()) return;
        if (detail.has("pois") && detail.get("pois").isJsonArray()) {
            for (JsonElement e : detail.getAsJsonArray("pois")) {
                JsonObject q = e.getAsJsonObject();
                if (!q.has("lat") || q.get("lat").isJsonNull() || !q.has("lon") || q.get("lon").isJsonNull()) continue;
                Integer h = near(tops, q.get("lat").getAsDouble(), q.get("lon").getAsDouble(), POI_M);
                if (h == null) continue;
                Double dem = q.has("ele_m") && !q.get("ele_m").isJsonNull() ? q.get("ele_m").getAsDouble() : null;
                if (dem != null && Math.abs(dem - h) > MAX_DIFF_M) continue;
                q.addProperty("ele_m", h);
                q.addProperty("ele_official", true);
            }
        }
        JsonObject course = detail.has("course") && detail.get("course").isJsonObject() ? detail.getAsJsonObject("course") : null;
        if (course == null || !detail.has("points")) return;
        List<Integer> passed = new ArrayList<>();
        JsonArray pts = detail.getAsJsonArray("points");
        for (int i = 0; i < pts.size(); i++) {
            JsonArray p = pts.get(i).getAsJsonArray(), q = pts.get(Math.max(0, i - 1)).getAsJsonArray();   // 앞 점과 이은 선분
            Integer h = passing(tops, q.get(1).getAsDouble(), q.get(0).getAsDouble(), p.get(1).getAsDouble(), p.get(0).getAsDouble(), PASS_M);
            if (h != null && !passed.contains(h)) passed.add(h);
        }
        Double dem = course.has("ele_max_m") && !course.get("ele_max_m").isJsonNull() ? course.get("ele_max_m").getAsDouble() : null;
        Integer top = courseTop(dem, passed);
        if (top != null) course.addProperty("ele_max_m", top);
    }
}
