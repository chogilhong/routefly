package com.gh.routefly.web;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * 코스마다 가장 가파른 1km 구간 경사(%) - 오르막 · 내리막 모두(2026-10-16 홍TV님).
 *
 * <p>난이도를 시간 · 오르막 총량으로만 정하자 오색(짧고 가파름) · 백담사(길고 완만함)가 같아졌고, 한계령 → 대청봉 → 남설악(급한 내리막)이 보통이었음.
 * 이 값으로 난이도를 한 단계 올릴 수 있게 목록 응답에 {@code steep_pct} 를 붙입니다. 코스가 길어져도 이 값은 줄지 않으므로 "길어지면 내려가지 않음" 은 그대로.
 * DB 는 읽기만 - 처음 볼 때 route_course_point 로 셈하고 메모리에 하루 둠(배치가 코스를 다시 넣어도 하루 안에 맞춰짐).
 * 같은 점으로 100대 명산 정상을 지나는지도 보아, 목록의 ele_max_m 을 공식 높이로 바꿈(Peaks - 2026-10-16 "대청봉 1,700 → 1,708").</p>
 */
final class Steep {

    private Steep() {
    }

    /** 구간 길이(m). */
    static final double WINDOW_M = 1000;
    /** 이보다 짧은 코스는 셈하지 않음(m). */
    static final double MIN_M = 300;
    private static final long TTL_MS = 24L * 3600 * 1000;
    private static final int MAX_ENTRIES = 50_000;
    /** 코스 ID → [경사 %(없으면 NaN), 셈한 시각, 지나는 정상의 공식 높이(없으면 NaN)]. */
    private static final Map<String, double[]> CACHE = new ConcurrentHashMap<>();

    /**
     * 순수 함수 - 가장 가파른 구간 경사(%, 소수 한 자리). dist · ele 는 같은 길이(ele 가 null 인 점은 건너뜀).
     * 코스가 WINDOW_M 보다 짧으면 처음 ~ 끝 하나로, MIN_M 보다 짧거나 고도가 없으면 null.
     */
    static Double steepest(double[] dist, Double[] ele) {
        List<double[]> p = new ArrayList<>();
        for (int i = 0; i < dist.length; i++) if (ele[i] != null) p.add(new double[] {dist[i], ele[i]});
        if (p.size() < 2) return null;
        double total = p.get(p.size() - 1)[0] - p.get(0)[0];
        if (total < MIN_M) return null;
        double best = 0;
        if (total < WINDOW_M) best = Math.abs(p.get(p.size() - 1)[1] - p.get(0)[1]) / total * 100;
        else {
            int j = 0;
            for (int i = 0; i < p.size(); i++) {
                if (j < i) j = i;
                while (j < p.size() && p.get(j)[0] - p.get(i)[0] < WINDOW_M) j++;
                if (j >= p.size()) break;
                double run = p.get(j)[0] - p.get(i)[0];
                best = Math.max(best, Math.abs(p.get(j)[1] - p.get(i)[1]) / run * 100);
            }
        }
        return Math.round(best * 10) / 10.0;
    }

    /**
     * 순수 함수 - 적어도 오르는 높이(m): 가장 높은 점 - 두 끝 가운데 낮은 쪽. 오르막 합은 이보다 작을 수 없음.
     * 2026-10-16 PC: 송추 → 사패능선 3.25km 오르막 6m(최고 446m) · 한계령 → 중청대피소 오르막 438m 처럼 DB 오르막이 이상한 코스. 고도가 없으면 null.
     */
    static Double minClimb(Double[] ele) {
        Double first = null, last = null, max = null;
        for (Double e : ele) {
            if (e == null) continue;
            if (first == null) first = e;
            last = e;
            if (max == null || e > max) max = e;
        }
        return first == null ? null : (double) Math.round(max - Math.min(first, last));
    }

    /** 순수 함수 - 보일 오르막: DB 값이 적어도 오르는 높이보다 작으면 그 높이(둘 다 없으면 null). */
    static Integer ascent(Integer db, Double minClimb) {
        if (minClimb == null) return db;
        return db == null || db < minClimb ? (int) Math.round(minClimb) : db;
    }

    /** 목록 줄(course_id · kind)마다 steep_pct 를 붙이고, 정상을 지나면 ele_max_m 을 공식 높이로 - 등산(hike · trek)만. 못 셈하면 그대로. */
    static void fill(Connection c, JsonArray rows, List<Peaks.Top> tops) {
        fill(c, rows, tops, List.of());
    }

    /** 이름의 정상까지 안 가는 코스 - 정상 이름 · 거리(목록 summit_miss · summit_miss_m, 화면 "정상 미포함", 2026-10-30 코스 점검). */
    private static final Peaks.Miss NONE = new Peaks.Miss("", 0);

    /** 순수 함수 - 목록에서 선이 이름의 정상에서 Peaks.HIDE_MISS_M 넘게 먼 코스를 뺌(2026-10-30 홍TV님 "해줘"). 뺀 수. */
    static int dropFarMiss(JsonArray rows) {
        int n = 0;
        for (int i = rows.size() - 1; i >= 0; i--) {
            JsonObject o = rows.get(i).getAsJsonObject();
            if (o.has("summit_miss_m") && o.get("summit_miss_m").getAsDouble() > Peaks.HIDE_MISS_M) {
                rows.remove(i);
                n++;
            }
        }
        return n;
    }

    private static final Map<String, Peaks.Miss> MISS = new ConcurrentHashMap<>();   // 문제 없는 코스는 NONE

    /** named - "정상 미포함" 을 볼 정상 자리(Peaks.named), 비면 보지 않음. */
    static void fill(Connection c, JsonArray rows, List<Peaks.Top> tops, List<Peaks.Top> named) {
        if (rows == null || rows.size() == 0) return;
        long now = System.currentTimeMillis();
        List<String> need = new ArrayList<>();
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            String id = str(o, "course_id"), kind = str(o, "kind");
            if (id == null || !("hike".equals(kind) || "trek".equals(kind))) continue;
            double[] hit = CACHE.get(id);
            if (hit == null || now - (long) hit[1] > TTL_MS || (!named.isEmpty() && !MISS.containsKey(id))) need.add(id);
        }
        Map<String, String> names = new java.util.HashMap<>();
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            if (str(o, "course_id") != null && str(o, "name") != null) names.put(str(o, "course_id"), str(o, "name"));
        }
        if (!need.isEmpty()) load(c, need, now, tops, named, names);
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            double[] hit = str(o, "course_id") == null ? null : CACHE.get(str(o, "course_id"));
            if (hit == null) continue;
            Peaks.Miss miss = MISS.get(str(o, "course_id"));
            if (miss != null && miss != NONE) {
                o.addProperty("summit_miss", miss.name());
                o.addProperty("summit_miss_m", Math.round(miss.m()));
            }
            if (!Double.isNaN(hit[0])) o.addProperty("steep_pct", hit[0]);
            if (hit.length > 3 && !Double.isNaN(hit[3])) {   // 오르막이 적어도 오르는 높이보다 작으면 그 높이로(난이도 · 화면)
                Integer db = o.has("ascent_m") && !o.get("ascent_m").isJsonNull() ? o.get("ascent_m").getAsInt() : null;
                Integer a = ascent(db, hit[3]);
                if (a != null && !a.equals(db)) o.addProperty("ascent_m", a);
            }
            if (hit.length > 2 && !Double.isNaN(hit[2])) {
                Double dem = o.has("ele_max_m") && !o.get("ele_max_m").isJsonNull() ? o.get("ele_max_m").getAsDouble() : null;
                Integer top = Peaks.courseTop(dem, List.of((int) hit[2]));
                if (top != null) o.addProperty("ele_max_m", top);
            }
        }
    }

    private static void load(Connection c, List<String> ids, long now, List<Peaks.Top> tops, List<Peaks.Top> named, Map<String, String> names) {
        if (CACHE.size() > MAX_ENTRIES) {
            CACHE.clear();
            MISS.clear();
        }
        for (int from = 0; from < ids.size(); from += 100) {   // IN 이 너무 길지 않게 100개씩
            List<String> part = ids.subList(from, Math.min(ids.size(), from + 100));
            String sql = "SELECT course_id, dist_m, ele_m, lat, lon FROM route_course_point WHERE course_id IN ("
                    + String.join(",", Collections.nCopies(part.size(), "?")) + ") ORDER BY course_id, seq";
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                for (int i = 0; i < part.size(); i++) ps.setString(i + 1, part.get(i));
                try (ResultSet rs = ps.executeQuery()) {
                    String cur = null;
                    List<Double> ds = new ArrayList<>(), es = new ArrayList<>(), las = new ArrayList<>(), los = new ArrayList<>();
                    double top = Double.NaN, pLat = Double.NaN, pLon = Double.NaN;
                    while (rs.next()) {
                        String id = rs.getString(1);
                        if (cur != null && !cur.equals(id)) {
                            put(cur, ds, es, now, top);
                            miss(cur, names.get(cur), las, los, named);
                            ds.clear();
                            es.clear();
                            las.clear();
                            los.clear();
                            top = Double.NaN;
                            pLat = Double.NaN;
                        }
                        cur = id;
                        ds.add(rs.getDouble(2));
                        double ele = rs.getDouble(3);
                        es.add(rs.wasNull() ? null : ele);
                        double lat = rs.getDouble(4), lon = rs.getDouble(5);
                        las.add(lat);
                        los.add(lon);
                        Integer h = Double.isNaN(pLat) ? Peaks.near(tops, lat, lon, Peaks.PASS_M) : Peaks.passing(tops, pLat, pLon, lat, lon, Peaks.PASS_M);   // 점 사이 선분까지
                        if (h != null && (Double.isNaN(top) || h > top)) top = h;
                        pLat = lat;
                        pLon = lon;
                    }
                    if (cur != null) {
                        put(cur, ds, es, now, top);
                        miss(cur, names.get(cur), las, los, named);
                    }
                }
                for (String id : part) CACHE.putIfAbsent(id, new double[] {Double.NaN, now, Double.NaN, Double.NaN});   // 점이 없는 코스 - 다시 묻지 않게
            } catch (Exception e) {
                return;   // 경사 없이 - 난이도는 시간 · 오르막으로
            }
        }
    }

    private static void miss(String id, String name, List<Double> las, List<Double> los, List<Peaks.Top> named) {
        if (named == null || named.isEmpty() || name == null) return;
        double[] a = new double[las.size()], b = new double[los.size()];
        for (int i = 0; i < a.length; i++) {
            a[i] = las.get(i);
            b[i] = los.get(i);
        }
        Peaks.Miss m = Peaks.miss(name, a, b, named);
        MISS.put(id, m == null ? NONE : m);
    }

    private static void put(String id, List<Double> ds, List<Double> es, long now, double top) {
        double[] d = new double[ds.size()];
        for (int i = 0; i < d.length; i++) d[i] = ds.get(i);
        Double s = steepest(d, es.toArray(new Double[0]));
        Double mc = minClimb(es.toArray(new Double[0]));
        CACHE.put(id, new double[] {s == null ? Double.NaN : s, now, top, mc == null ? Double.NaN : mc});
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
