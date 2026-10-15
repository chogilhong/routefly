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
 * DB 는 읽기만 - 처음 볼 때 route_course_point 로 셈하고 메모리에 하루 둠(배치가 코스를 다시 넣어도 하루 안에 맞춰짐).</p>
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
    /** 코스 ID → [경사 %(없으면 NaN), 셈한 시각]. */
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

    /** 목록 줄(course_id · kind)마다 steep_pct 를 붙임 - 등산(hike · trek)만. 못 셈하면 칸 없이. */
    static void fill(Connection c, JsonArray rows) {
        if (rows == null || rows.size() == 0) return;
        long now = System.currentTimeMillis();
        List<String> need = new ArrayList<>();
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            String id = str(o, "course_id"), kind = str(o, "kind");
            if (id == null || !("hike".equals(kind) || "trek".equals(kind))) continue;
            double[] hit = CACHE.get(id);
            if (hit == null || now - (long) hit[1] > TTL_MS) need.add(id);
        }
        if (!need.isEmpty()) load(c, need, now);
        for (JsonElement e : rows) {
            JsonObject o = e.getAsJsonObject();
            double[] hit = str(o, "course_id") == null ? null : CACHE.get(str(o, "course_id"));
            if (hit != null && !Double.isNaN(hit[0])) o.addProperty("steep_pct", hit[0]);
        }
    }

    private static void load(Connection c, List<String> ids, long now) {
        if (CACHE.size() > MAX_ENTRIES) CACHE.clear();
        for (int from = 0; from < ids.size(); from += 100) {   // IN 이 너무 길지 않게 100개씩
            List<String> part = ids.subList(from, Math.min(ids.size(), from + 100));
            String sql = "SELECT course_id, dist_m, ele_m FROM route_course_point WHERE course_id IN ("
                    + String.join(",", Collections.nCopies(part.size(), "?")) + ") ORDER BY course_id, seq";
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                for (int i = 0; i < part.size(); i++) ps.setString(i + 1, part.get(i));
                try (ResultSet rs = ps.executeQuery()) {
                    String cur = null;
                    List<Double> ds = new ArrayList<>(), es = new ArrayList<>();
                    while (rs.next()) {
                        String id = rs.getString(1);
                        if (cur != null && !cur.equals(id)) {
                            put(cur, ds, es, now);
                            ds.clear();
                            es.clear();
                        }
                        cur = id;
                        ds.add(rs.getDouble(2));
                        double ele = rs.getDouble(3);
                        es.add(rs.wasNull() ? null : ele);
                    }
                    if (cur != null) put(cur, ds, es, now);
                }
                for (String id : part) CACHE.putIfAbsent(id, new double[] {Double.NaN, now});   // 점이 없는 코스 - 다시 묻지 않게
            } catch (Exception e) {
                return;   // 경사 없이 - 난이도는 시간 · 오르막으로
            }
        }
    }

    private static void put(String id, List<Double> ds, List<Double> es, long now) {
        double[] d = new double[ds.size()];
        for (int i = 0; i < d.length; i++) d[i] = ds.get(i);
        Double s = steepest(d, es.toArray(new Double[0]));
        CACHE.put(id, new double[] {s == null ? Double.NaN : s, now});
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
