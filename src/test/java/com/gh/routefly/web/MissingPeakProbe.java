package com.gh.routefly.web;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;

/**
 * 100대 명산 중 빠진 2곳(천성산 · 대암산 - 산림청 GPX 가 정상 쪽을 안 지나 배치가 뺌) 정상 자리 찾기. 시험이 아님(DB 를 읽기만).
 * 2026-10-18 홍TV님 "빠진 2곳 찾기". 우리 DB 의 다른 코스(산림청 등산로 · 국립공원 등)에 그 산 이름 지점 · 코스 끝이 있는지 봅니다.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.MissingPeakProbe
 * </pre>
 */
public final class MissingPeakProbe {

    private MissingPeakProbe() {
    }

    /** 산 · 넓은 둘레(남, 북, 서, 동) · 찾을 이름. 둘레는 시 · 군 크기로 넓게(그 안의 이름만 봄). */
    static final Object[][] PEAKS = {
        {"천성산", new double[] {35.30, 35.55, 128.95, 129.25}, new String[] {"천성산", "원효봉", "비로봉"}},
        {"대암산", new double[] {38.05, 38.35, 127.95, 128.30}, new String[] {"대암산", "용늪"}}};

    public static void main(String[] args) throws Exception {
        try (Connection c = Db.open()) {
            for (Object[] p : PEAKS) {
                double[] b = (double[]) p[1];
                System.out.println("==== " + p[0]);
                for (String n : (String[]) p[2]) {
                    print(c, "지점(route_course_poi) '" + n + "'", "SELECT name, ROUND(lat, 6) lat, ROUND(lon, 6) lon, ele_m, COUNT(*) n, MIN(course_id) course FROM route_course_poi"
                            + " WHERE name LIKE ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? GROUP BY name, ROUND(lat, 6), ROUND(lon, 6), ele_m ORDER BY ele_m DESC LIMIT 20", n, b);
                    print(c, "코스(route_course) '" + n + "'", "SELECT course_id, name, kind, distance_m, ascent_m, ele_max_m, start_lat, start_lon, end_lat, end_lon FROM route_course"
                            + " WHERE name LIKE ? AND ((start_lat BETWEEN ? AND ? AND start_lon BETWEEN ? AND ?) OR (end_lat BETWEEN ? AND ? AND end_lon BETWEEN ? AND ?)) LIMIT 30", n, b);
                }
                print(c, "둘레의 가장 높은 코스 점 10(같은 자리는 하나)", "SELECT ROUND(p.lat, 4) lat4, ROUND(p.lon, 4) lon4, MAX(p.ele_m) ele, MIN(r.name) course, MIN(r.ele_source) src FROM route_course_point p"
                        + " JOIN route_course r ON r.course_id = p.course_id WHERE p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ? GROUP BY ROUND(p.lat, 4), ROUND(p.lon, 4) ORDER BY ele DESC LIMIT 10", null, b);
            }
        }
    }

    private static void print(Connection c, String title, String sql, String like, double[] b) throws Exception {
        System.out.println("-- " + title);
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            int i = 1;
            if (like != null) ps.setString(i++, "%" + like + "%");
            int reps = sql.contains("OR (end_lat") ? 2 : 1;
            for (int r = 0; r < reps; r++) for (double v : b) ps.setDouble(i++, v);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                int n = 0;
                while (rs.next()) {
                    StringBuilder s = new StringBuilder("   ");
                    for (int k = 1; k <= md.getColumnCount(); k++) s.append(md.getColumnLabel(k)).append('=').append(rs.getString(k)).append("  ");
                    System.out.println(s);
                    n++;
                }
                if (n == 0) System.out.println("   (없음)");
            }
        }
    }
}
