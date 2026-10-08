package com.gh.routefly.web;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

/**
 * 코스 조회. routefly-batch 가 넣는 세 표(route_course / route_course_point / route_course_poi)를 읽기만 합니다.
 * 표 정의는 routefly-batch 의 sql/route_ddl.sql 입니다.
 */
final class CourseQueries {

    private CourseQueries() {
    }

    /**
     * 목록에 한 번에 내주는 최대 코스 수. 산림청 등산로를 넣으면 전국 수천 개라, 화면은 이름 검색이나
     * 지도 범위로 좁혀서 받습니다. 이보다 많으면 truncated=true 로 알려 "더 확대하세요" 를 띄웁니다.
     */
    static final int LIST_LIMIT = 300;

    /** 검색어 최대 길이. */
    static final int MAX_QUERY = 50;

    /** routefly-batch 의 코스 ID 규칙과 같습니다(파일 이름 - 영문 소문자 · 숫자 · - · _). */
    static final Pattern COURSE_ID = Pattern.compile("[a-z0-9][a-z0-9_-]{0,63}");
    static final Pattern KIND = Pattern.compile("[a-z][a-z_-]{0,19}");

    static final String LIST_COLUMNS = "course_id, name, kind, distance_m, ascent_m, descent_m, ele_min_m, ele_max_m,"
            + " ele_source, point_cnt, start_lat, start_lon, end_lat, end_lon, min_lat, min_lon, max_lat, max_lon";

    private static final Pattern GROUP_ID = Pattern.compile("^((?:frst|osmb|osmh)-[0-9]+-)");

    /**
     * 순수 함수 - 같은 산(산림청 산 코드) · 같은 자전거길 · 등산 · 걷기 노선(OSM relation, osmb · osmh) 코스 ID 의 앞부분.
     * "frst-488605302-24c8b1" → "frst-488605302-". 묶음이 없는 코스면 null.
     * 배치를 다시 돌려 코스 번호가 바뀌면 예전 링크 · 기록이 이것으로 같은 산 코스를 찾습니다.
     */
    static String groupPrefix(String id) {
        if (id == null) return null;
        java.util.regex.Matcher m = GROUP_ID.matcher(id);
        return m.find() ? m.group(1) : null;
    }

    /** 같은 산 · 같은 자전거길 코스 목록(없는 코스 ID 를 받았을 때). 묶음이 없으면 빈 목록. */
    static JsonArray sameGroup(Connection c, String id) throws Exception {
        String p = groupPrefix(id);
        if (p == null) return new JsonArray();
        return Json.rows(c, "SELECT " + LIST_COLUMNS + " FROM route_course WHERE course_id LIKE ? ORDER BY name LIMIT 30", p + "%");
    }

    /** 순수 함수 - 코스 ID 가 규칙에 맞는가. */
    static boolean validId(String id) {
        return id != null && COURSE_ID.matcher(id).matches();
    }

    /** 순수 함수 - 종류 필터. 비었으면 null, 규칙에 안 맞으면 IllegalArgumentException. */
    static String parseKind(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String k = raw.trim().toLowerCase(Locale.ROOT);
        if (!KIND.matcher(k).matches()) throw new IllegalArgumentException("kind 는 영문 소문자로 적습니다(예: hike).");
        return k;
    }

    /** 순수 함수 - 이름 검색어. 비었으면 null. 앞뒤 공백을 떼고 50자까지. */
    static String parseQuery(String raw) {
        if (raw == null) return null;
        String q = raw.trim().replaceAll("\\s+", " ");
        if (q.isEmpty()) return null;
        return q.length() > MAX_QUERY ? q.substring(0, MAX_QUERY) : q;
    }

    /** 순수 함수 - LIKE '%검색어%' 패턴. % _ \ 는 글자 그대로 찾게 이스케이프합니다. */
    static String likePattern(String q) {
        return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /**
     * 순수 함수 - 화면 범위 {@code bbox=서경,남위,동경,북위}(minLon,minLat,maxLon,maxLat). 비었으면 null.
     * 숫자가 아니거나 범위가 뒤집혔으면 IllegalArgumentException.
     */
    static double[] parseBbox(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String[] parts = raw.split(",");
        if (parts.length != 4) throw new IllegalArgumentException("bbox 는 minLon,minLat,maxLon,maxLat 네 숫자입니다.");
        double[] b = new double[4];
        for (int i = 0; i < 4; i++) {
            try {
                b[i] = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("bbox 에 숫자가 아닌 값이 있습니다: " + parts[i].trim());
            }
            if (Double.isNaN(b[i]) || Double.isInfinite(b[i])) throw new IllegalArgumentException("bbox 값이 숫자가 아닙니다.");
        }
        if (b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || b[0] >= b[2] || b[1] >= b[3]) {
            throw new IllegalArgumentException("bbox 범위가 맞지 않습니다(서경 < 동경, 남위 < 북위).");
        }
        return b;
    }

    /** 순수 함수 - bbox → WKT 사각형. MariaDB 는 SRID 4326 에서도 (경도 위도) 순서입니다. */
    static String bboxWkt(double[] b) {
        String w = num(b[0]), s = num(b[1]), e = num(b[2]), n = num(b[3]);
        return "POLYGON((" + w + " " + s + "," + e + " " + s + "," + e + " " + n + "," + w + " " + n + "," + w + " " + s + "))";
    }

    private static String num(double v) {
        return BigDecimal.valueOf(v).toPlainString();
    }

    /**
     * 코스 목록(경로 점은 빼고 요약만). bbox · kind · q 는 없으면 null.
     * 최대 {@link #LIST_LIMIT} + 1 줄을 읽습니다 - 한 줄이 더 있으면 잘렸다는 뜻입니다(서블릿이 떼고 알림).
     */
    static JsonArray list(Connection c, double[] bbox, String kind, String q) throws Exception {
        StringBuilder sql = new StringBuilder("SELECT ").append(LIST_COLUMNS).append(" FROM route_course");
        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();
        if (bbox != null) {
            // 공간 인덱스(spx_route_course_path)를 탑니다.
            where.add("MBRIntersects(path, ST_GeomFromText(?, 4326))");
            params.add(bboxWkt(bbox));
        }
        if (kind != null) {
            where.add("kind = ?");
            params.add(kind);
        }
        if (q != null) {
            where.add("name LIKE ?");
            params.add(likePattern(q));
        }
        if (!where.isEmpty()) sql.append(" WHERE ").append(String.join(" AND ", where));
        // 검색어로 시작하는 이름이 먼저('송산' → 송산 · … 가 공주향교뒷산 · 송산리… 보다 앞)
        if (q != null) {
            sql.append(" ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name");
            params.add(likePattern(q).substring(1));
        } else {
            sql.append(" ORDER BY name");
        }
        sql.append(" LIMIT ").append(LIST_LIMIT + 1);
        return Json.rows(c, sql.toString(), params.toArray());
    }

    /**
     * 코스 하나 - 요약 + 경로 점 + 이름표. 없으면 null.
     * <pre>
     *   course : 요약(목록과 같은 칸 + imported_at)
     *   points : [[경도, 위도, 고도(m) 또는 null, 누적 거리(m)], ...]  - 크기를 줄이려고 배열로 보냅니다
     *   pois   : [{seq, name, lat, lon, ele_m, dist_m, off_route_m}, ...]  - 경로 순서
     * </pre>
     */
    static JsonObject detail(Connection c, String id) throws Exception {
        JsonArray course = Json.rows(c, "SELECT " + LIST_COLUMNS + ", imported_at FROM route_course WHERE course_id = ?", id);
        if (course.size() == 0) return null;

        JsonArray points = new JsonArray();
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT lon, lat, ele_m, dist_m FROM route_course_point WHERE course_id = ? ORDER BY seq")) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    JsonArray p = new JsonArray(4);
                    p.add(rs.getBigDecimal(1));
                    p.add(rs.getBigDecimal(2));
                    BigDecimal ele = rs.getBigDecimal(3);
                    if (ele == null) p.add(JsonNull.INSTANCE); else p.add(ele);
                    p.add(rs.getInt(4));
                    points.add(p);
                }
            }
        }

        JsonObject out = new JsonObject();
        out.add("course", course.get(0));
        out.add("points", points);
        out.add("pois", Json.rows(c,
                "SELECT seq, name, lat, lon, ele_m, dist_m, off_route_m FROM route_course_poi WHERE course_id = ? ORDER BY seq",
                id));
        return out;
    }
}
