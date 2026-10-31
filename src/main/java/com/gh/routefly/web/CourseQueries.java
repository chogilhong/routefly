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

    /** 등산 · 걷기 둘 다인 코스의 종류 값(routefly-batch 가 넣음). 등산 탭 · 걷기 탭 모두에 나옵니다. */
    static final String TREK = "trek";

    /**
     * 목록 줄(/api/courses · /api/group · 없는 코스의 similar). 2026-10-11 속도: 화면이 목록 줄에서 읽는 칸만
     * (이름 · 종류 · 거리 · 오르막 · 최고 고도 · 출발점(지도 점 · 가까운 순) · 끝점(series.js geoOrder)).
     */
    static final String LIST_COLUMNS = "course_id, name, kind, distance_m, ascent_m, ele_max_m, start_lat, start_lon, end_lat, end_lon";

    /** 코스 하나의 요약(/api/course) - 모든 칸(signsNear · spotsNear 가 min/max 를, 화면이 ele_source 를 씀). */
    static final String COURSE_COLUMNS = "course_id, name, kind, distance_m, ascent_m, descent_m, ele_min_m, ele_max_m,"
            + " ele_source, point_cnt, start_lat, start_lon, end_lat, end_lon, min_lat, min_lon, max_lat, max_lon";

    private static final Pattern GROUP_ID = Pattern.compile("^((?:frst|osmb|osmh|kmp|kmf)-[0-9]+-)");

    /**
     * 순수 함수 - 같은 산(산림청 산 코드 · 한국등산트레킹지원센터 봉우리 kmp) · 같은 자전거길 · 등산 · 걷기 노선(OSM relation osmb · osmh, 국가숲길 kmf) 코스 ID 의 앞부분.
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
        // 글자(코드 포인트) 단위로 자름 - 이모지 반쪽이 남지 않게
        return q.codePointCount(0, q.length()) > MAX_QUERY ? q.substring(0, q.offsetByCodePoints(0, MAX_QUERY)) : q;
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

    static String num(double v) {
        return BigDecimal.valueOf(v).toPlainString();
    }

    /** SQL 과 ? 에 들어갈 값(등장 순서). */
    record Sql(String sql, Object[] params) {
    }

    /**
     * 코스 목록(경로 점은 빼고 요약만). bbox · kind · q 는 없으면 null.
     * 최대 {@link #LIST_LIMIT} + 1 줄을 읽습니다 - 한 줄이 더 있으면 잘렸다는 뜻입니다(서블릿이 떼고 알림).
     */
    static JsonArray list(Connection c, double[] bbox, String kind, String q) throws Exception {
        Sql s = listSql(bbox, kind, q);
        JsonArray rows = Json.rows(c, s.sql(), s.params());
        if (q != null || bbox == null) rows = naturalSorted(rows, q);   // 지도 범위만 볼 때는 가까운 순 그대로
        return rows;
    }

    /**
     * 순수 함수 - 이름 안의 숫자는 숫자 크기로("해파랑길 1 · 2 · … · 9 · 10 · 50코스", 2026-10-31 홍TV님 - 예전엔 글자 순이라 1 · 10 · 11 … 4 · 49 · 5 · 50).
     * 검색어로 시작하는 이름이 먼저(listSql 과 같은 규칙)는 그대로 둡니다.
     */
    static JsonArray naturalSorted(JsonArray rows, String q) {
        List<com.google.gson.JsonElement> a = new ArrayList<>();
        rows.forEach(a::add);
        String head = q == null ? null : q.trim().toLowerCase(Locale.ROOT);
        java.util.Comparator<com.google.gson.JsonElement> byHead = java.util.Comparator.comparingInt(e -> head == null || head.isEmpty() || nameOf(e).toLowerCase(Locale.ROOT).startsWith(head) ? 0 : 1);
        a.sort(byHead.thenComparing((x, y) -> naturalCompare(nameOf(x), nameOf(y))));
        JsonArray out = new JsonArray();
        a.forEach(out::add);
        return out;
    }

    private static String nameOf(com.google.gson.JsonElement e) {
        com.google.gson.JsonElement n = e.isJsonObject() ? e.getAsJsonObject().get("name") : null;
        return n == null || n.isJsonNull() ? "" : n.getAsString();
    }

    /** 순수 함수 - 숫자 덩어리는 수로, 나머지는 글자로 견줌("5코스" < "10코스" < "50코스"). */
    static int naturalCompare(String a, String b) {
        int i = 0, j = 0;
        while (i < a.length() && j < b.length()) {
            char ca = a.charAt(i), cb = b.charAt(j);
            if (Character.isDigit(ca) && Character.isDigit(cb)) {
                int si = i, sj = j;
                while (i < a.length() && Character.isDigit(a.charAt(i))) i++;
                while (j < b.length() && Character.isDigit(b.charAt(j))) j++;
                String na = a.substring(si, i).replaceFirst("^0+(?=.)", ""), nb = b.substring(sj, j).replaceFirst("^0+(?=.)", "");
                int d = na.length() != nb.length() ? Integer.compare(na.length(), nb.length()) : na.compareTo(nb);
                if (d != 0) return d;
            } else {
                if (ca != cb) return Character.compare(ca, cb);
                i++;
                j++;
            }
        }
        return Integer.compare(a.length() - i, b.length() - j);
    }

    /**
     * 순수 함수 - 목록 SQL. 검색어가 있으면 그 말로 시작하는 이름 먼저, 지도 범위만 있으면 범위 가운데에서 가까운 출발점 먼저
     * (2026-10-09 홍TV님 - 전국을 볼 때 이름 순 앞 300개("116고지 · 133고지 …")만 와서 코스가 엉뚱한 곳에만 보이던 것), 둘 다 없으면 이름 순.
     */
    static Sql listSql(double[] bbox, String kind, String q) {
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT ").append(LIST_COLUMNS).append(" FROM route_course").append(where(bbox, kind, q, params));
        if (q != null) {
            // 검색어로 시작하는 이름이 먼저('송산' → 송산 · … 가 공주향교뒷산 · 송산리… 보다 앞)
            sql.append(" ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name");
            params.add(likePattern(q).substring(1));
        } else if (bbox != null) {
            // 가운데에서 가까운 순 - 경도 1° 는 위도 1° 보다 짧아(cos 위도) 곱해서 맞춥니다
            double lat = (bbox[1] + bbox[3]) / 2, lon = (bbox[0] + bbox[2]) / 2;
            sql.append(" ORDER BY POW(start_lat - ?, 2) + POW((start_lon - ?) * ?, 2), name");
            params.add(lat);
            params.add(lon);
            params.add(Math.cos(Math.toRadians(lat)));
        } else {
            sql.append(" ORDER BY name");
        }
        sql.append(" LIMIT ").append(LIST_LIMIT + 1);
        return new Sql(sql.toString(), params.toArray());
    }

    /**
     * 넓게 볼 때 긴 변을 몇 칸으로 나눠 셀지. 2026-10-09 홍TV님 핸드폰: 24칸이면 전국 18,780개가 원 수백 개로 겹쳐 지도를 덮어 12칸으로
     * (세로로 긴 핸드폰 화면에서 칸 하나가 약 60px - 가장 큰 원(지름 32px)도 서로 덜 겹침).
     */
    static final int GRID_CELLS = 12;

    /**
     * 지도 범위 안 코스 수를 격자 칸마다 셉니다 - 목록이 {@link #LIST_LIMIT} 를 넘을 때 화면이 전국 · 넓은 범위의 코스 분포를 원으로 그립니다.
     * 줄마다 {@code {n, lon, lat}}(칸 안 출발점 평균 자리).
     */
    static JsonArray grid(Connection c, double[] bbox, String kind) throws Exception {
        Sql s = gridSql(bbox, kind);
        return Json.rows(c, s.sql(), s.params());
    }

    /** 순수 함수 - 격자 세기 SQL. 칸 크기는 {@link #gridCellDeg}. */
    static Sql gridSql(double[] bbox, String kind) {
        List<Object> params = new ArrayList<>();
        String w = where(bbox, kind, null, params);
        double cell = gridCellDeg(bbox);
        params.add(cell);
        params.add(cell);
        return new Sql("SELECT COUNT(*) AS n, ROUND(AVG(start_lon), 5) AS lon, ROUND(AVG(start_lat), 5) AS lat FROM route_course" + w
                + " GROUP BY FLOOR(start_lon / ?), FLOOR(start_lat / ?)", params.toArray());
    }

    /** 순수 함수 - 격자 칸 크기(도). 범위의 긴 변 ÷ {@link #GRID_CELLS}, 0.01° 보다 작게는 나누지 않습니다. */
    static double gridCellDeg(double[] bbox) {
        return Math.max(0.01, Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / GRID_CELLS);
    }

    private static String where(double[] bbox, String kind, String q, List<Object> params) {
        List<String> where = new ArrayList<>();
        if (bbox != null) {
            // 공간 인덱스(spx_route_course_path)를 탑니다.
            where.add("MBRIntersects(path, ST_GeomFromText(?, 4326))");
            params.add(bboxWkt(bbox));
        }
        if (kind != null && (kind.equals("hike") || kind.equals("walk"))) {
            // 2026-10-10 홍TV님: 등산 · 걷기가 애매한 코스(kind=trek - 선자령순환등산로 등)는 두 탭 모두에
            where.add("kind IN (?, ?)");
            params.add(kind);
            params.add(TREK);
        } else if (kind != null) {
            where.add("kind = ?");
            params.add(kind);
        }
        if (q != null) {
            where.add("name LIKE ?");
            params.add(likePattern(q));
        }
        return where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);
    }

    /**
     * 코스 하나 - 요약 + 경로 점 + 이름표. 없으면 null.
     * <pre>
     *   course : 요약(COURSE_COLUMNS + imported_at)
     *   points : [[경도, 위도, 고도(m) 또는 null, 누적 거리(m)], ...]  - 크기를 줄이려고 배열로 보냅니다
     *   pois   : [{seq, name, lat, lon, ele_m, dist_m, off_route_m}, ...]  - 경로 순서
     *   info   : {up_min, down_min, level, notice} - 국립공원 공식 코스만(없으면 칸 없음)
     *   signs  : [{loc_no, place_name, ele_m, call_ok, lat, lon}, ...] - 경로에서 SIGN_NEAR_M 안의 국립공원 위치표지판
     *            (route_signpost, routefly-batch knpsSign). 없거나 표가 없으면 칸 없음
     *   spots  : [{kind, name, info, ele_m, view_az, view_m, lat, lon, dist_m, off_m}, ...] - 국립공원 위험지역 · 구급함 · 헬기장 ·
     *            공원지킴터 · 조망점(route_park_spot, knpsSpot). 위험 · 조망은 경로 100m, 나머지는 400m 안. dist_m 은 가장 가까운 경로 점의 누적 거리
     * </pre>
     */
    /** 공식 정보(route_course_info)가 있는 코스 ID 앞부분 - 국립공원 탐방로 공간데이터(routefly-batch knpsTrail). */
    static final String INFO_PREFIX = "knps-";

    static JsonObject detail(Connection c, String id) throws Exception {
        JsonArray course = Json.rows(c, "SELECT " + COURSE_COLUMNS + ", imported_at FROM route_course WHERE course_id = ?", id);
        if (course.size() == 0) return null;

        // 2026-10-11 속도: 경도 · 위도는 소수 5자리(약 1m - 표는 6자리)로 보냄. 표지판 · 위험지역 찾기는 표 값 그대로(xy)
        JsonArray points = new JsonArray();
        List<double[]> xy = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT lon, lat, ele_m, dist_m FROM route_course_point WHERE course_id = ? ORDER BY seq")) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double lon = rs.getDouble(1), lat = rs.getDouble(2);
                    JsonArray p = new JsonArray(4);
                    p.add(round5(lon));
                    p.add(round5(lat));
                    BigDecimal ele = rs.getBigDecimal(3);
                    if (ele == null) p.add(JsonNull.INSTANCE); else p.add(ele);
                    int dist = rs.getInt(4);
                    p.add(dist);
                    points.add(p);
                    xy.add(new double[] {lon, lat, dist});
                }
            }
        }
        double[][] path = xy.toArray(new double[0][]);

        JsonObject out = new JsonObject();
        out.add("course", course.get(0));
        out.add("points", points);
        out.add("pois", Json.rows(c,
                "SELECT seq, name, lat, lon, ele_m, dist_m, off_route_m FROM route_course_poi WHERE course_id = ? ORDER BY seq",
                id));
        // 2026-10-13 홍TV님: "출발" · "도착" 보다 들머리 · 날머리 이름 - 이름에 출발 · 도착이 없는 코스("대청봉코스")는 둘레 다른 코스 끝 이름(화면이 고름)
        try {
            JsonObject ends = endNames(c, id, course.get(0).getAsJsonObject());
            if (ends.size() > 0) out.add("ends", ends);
        } catch (java.sql.SQLException e) {
            // 이름 없이 - 화면은 "출발" · "도착"
        }
        // 2026-10-10 홍TV님: 국립공원 공식 코스(knps-)는 공단 기준 시간 · 난이도(route_course_info). 표가 아직 없으면(DDL 전) 빼고 보냅니다.
        if (id.startsWith(INFO_PREFIX)) {
            try {
                JsonArray info = Json.rows(c, "SELECT up_min, down_min, level, notice FROM route_course_info WHERE course_id = ?", id);
                if (info.size() > 0) out.add("info", info.get(0));
            } catch (java.sql.SQLException e) {
                // 표 없음 - 공식 정보 없이
            }
        }
        // 2026-10-10 홍TV님: 국립공원 다목적위치표지판(지리10-05) - 따라가기 · SOS 에서 가까운 표지 번호(119 신고). 표가 없으면 빼고.
        try {
            JsonArray signs = signsNear(c, path, course.get(0).getAsJsonObject());
            if (signs.size() > 0) out.add("signs", signs);
        } catch (java.sql.SQLException e) {
            // 표 없음 - 표지 없이
        }
        // 2026-10-10 홍TV님: 국립공원 위험지역 · 조망점(낙석주의 앞 알림 · SOS 구급함 · 헬기장). 표가 없으면 빼고.
        try {
            JsonArray spots = spotsNear(c, path, course.get(0).getAsJsonObject());
            if (spots.size() > 0) out.add("spots", spots);
        } catch (java.sql.SQLException e) {
            // 표 없음
        }
        return out;
    }

    /** 출발 · 도착 이름을 찾는 거리(m) - 다른 코스의 처음 · 끝이 이 안이면 같은 들머리 · 날머리. */
    static final double END_NAME_M = 300;

    /** 출발 · 도착 둘레 다른 코스의 끝 이름 {start, end}(찾은 것만). 다른 코스 끝 좌표로 고르고, 이름은 그 코스 이름의 처음 · 끝 낱말. */
    static JsonObject endNames(Connection c, String id, JsonObject course) throws Exception {
        JsonObject out = new JsonObject();
        if (!course.has("start_lat") || course.get("start_lat").isJsonNull() || course.get("end_lat").isJsonNull()) return out;
        double[][] at = {{course.get("start_lat").getAsDouble(), course.get("start_lon").getAsDouble()},
                         {course.get("end_lat").getAsDouble(), course.get("end_lon").getAsDouble()}};
        String[] keys = {"start", "end"};
        for (int k = 0; k < 2; k++) {
            double lat = at[k][0], lon = at[k][1], dl = END_NAME_M / 111_000.0, dn = dl / Math.max(0.2, Math.cos(Math.toRadians(lat)));
            List<String[]> rows = new ArrayList<>();
            try (PreparedStatement ps = c.prepareStatement("SELECT name, start_lat, start_lon, end_lat, end_lon FROM route_course WHERE course_id <> ?"
                    + " AND ((start_lat BETWEEN ? AND ? AND start_lon BETWEEN ? AND ?) OR (end_lat BETWEEN ? AND ? AND end_lon BETWEEN ? AND ?)) LIMIT 300")) {
                Object[] p = {id, lat - dl, lat + dl, lon - dn, lon + dn, lat - dl, lat + dl, lon - dn, lon + dn};
                for (int i = 0; i < p.length; i++) ps.setObject(i + 1, p[i]);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) rows.add(new String[] {rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)});
                }
            }
            String n = endNameOf(rows, lat, lon, END_NAME_M);
            if (n != null) out.addProperty(keys[k], n);
        }
        return out;
    }

    /** 순수 함수 - 코스 이름의 처음 · 끝 낱말("산 · 가 → 나 → 다" → 가 · 다, "가에서" · "나까지", 국가숲길 "가-나"). 모르면 null. */
    static String[] nameEnds(String name) {
        if (name == null) return new String[] {null, null};
        int i = name.indexOf(" · ");
        String route = (i >= 0 ? name.substring(i + 3) : name).trim();
        String[] parts = route.split(" → ");
        if (parts.length >= 2) return new String[] {parts[0].trim(), parts[parts.length - 1].trim()};
        java.util.regex.Matcher one = java.util.regex.Pattern.compile("^(.+?)(에서|까지)$").matcher(route);
        if (one.matches()) return "에서".equals(one.group(2)) ? new String[] {one.group(1), null} : new String[] {null, one.group(1)};
        java.util.regex.Matcher loop = java.util.regex.Pattern.compile("^(.+?)\\s*순환$").matcher(route);
        if (loop.matches()) return new String[] {loop.group(1), loop.group(1)};
        java.util.regex.Matcher ab = java.util.regex.Pattern.compile("([가-힣]+)-([가-힣]+)\\s*\\)?\\s*$").matcher(name);
        return ab.find() ? new String[] {ab.group(1), ab.group(2)} : new String[] {null, null};
    }

    /** 막연한 이름(어디인지 모름) - 들머리 · 날머리 이름으로 쓰지 않음. */
    private static final java.util.regex.Pattern VAGUE = java.util.regex.Pattern.compile("^(갈림길|삼거리|사거리|정상|탐방로 끝|출발|도착)$|(쪽 끝|부근|코스\\s*\\d*)$");
    /** 들머리다운 이름(탐방지원센터 · 주차장 · 마을 · 역 …) - 먼저 고름. */
    private static final java.util.regex.Pattern HEADISH = java.util.regex.Pattern.compile(".*(탐방지원센터|탐방안내소|분소|매표소|주차장|휴게소|입구|마을|리|동|역|정류장|인증센터|사)$");

    /**
     * 순수 함수 - (lat, lon) radiusM 안에서 처음 · 끝이 닿는 다른 코스 [이름, 처음 위도, 처음 경도, 끝 위도, 끝 경도] 들의 그 끝 이름.
     * 들머리다운 이름 먼저, 같으면 가까운 것. 막연한 이름은 뺌. 없으면 null.
     */
    static String endNameOf(List<String[]> rows, double lat, double lon, double radiusM) {
        String best = null;
        double bestScore = Double.MAX_VALUE;
        for (String[] r : rows) {
            String[] e = nameEnds(r[0]);
            for (int k = 0; k < 2; k++) {
                String n = e[k], la = r[1 + k * 2], lo = r[2 + k * 2];
                if (n == null || n.isBlank() || la == null || lo == null || VAGUE.matcher(n).find()) continue;
                double d = distM(new double[] {Double.parseDouble(lo), Double.parseDouble(la)}, lat, lon);
                if (d > radiusM) continue;
                double score = (HEADISH.matcher(n.replaceAll("\\s+", "")).matches() ? 0 : 10_000) + d;
                if (score < bestScore) { bestScore = score; best = n; }
            }
        }
        return best;
    }

    /** 위험지역 · 조망점은 경로 이 거리(m) 안. */
    static final double SPOT_NEAR_M = 100;
    /** 구급함 · 헬기장 · 공원지킴터는 조금 떨어져도(SOS 에 알려 줌). */
    static final double HELP_NEAR_M = 400;

    static JsonArray spotsNear(Connection c, double[][] points, JsonObject course) throws Exception {
        JsonArray out = new JsonArray();
        if (points.length == 0 || !course.has("min_lat") || course.get("min_lat").isJsonNull()) return out;
        double pad = 0.004;
        try (PreparedStatement ps = c.prepareStatement("SELECT kind, name, info, ele_m, view_az, view_m, lat, lon FROM route_park_spot"
                + " WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?")) {
            ps.setDouble(1, course.get("min_lat").getAsDouble() - pad);
            ps.setDouble(2, course.get("max_lat").getAsDouble() + pad);
            ps.setDouble(3, course.get("min_lon").getAsDouble() - pad * 1.25);
            ps.setDouble(4, course.get("max_lon").getAsDouble() + pad * 1.25);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String kind = rs.getString(1);
                    double lat = rs.getDouble(7), lon = rs.getDouble(8);
                    int i = nearIndex(points, lat, lon);
                    double off = i < 0 ? Double.POSITIVE_INFINITY : distM(points[i], lat, lon);
                    if (off > ("danger".equals(kind) || "view".equals(kind) ? SPOT_NEAR_M : HELP_NEAR_M)) continue;
                    JsonObject o = new JsonObject();
                    o.addProperty("kind", kind);
                    o.addProperty("name", rs.getString(2));
                    o.addProperty("info", rs.getString(3));
                    for (int k = 4; k <= 6; k++) {
                        int v = rs.getInt(k);
                        String col = k == 4 ? "ele_m" : k == 5 ? "view_az" : "view_m";
                        if (rs.wasNull()) o.add(col, JsonNull.INSTANCE); else o.addProperty(col, v);
                    }
                    o.add("lat", new com.google.gson.JsonPrimitive(rs.getBigDecimal(7)));
                    o.add("lon", new com.google.gson.JsonPrimitive(rs.getBigDecimal(8)));
                    o.addProperty("dist_m", (int) points[i][2]);
                    o.addProperty("off_m", (int) Math.round(off));
                    out.add(o);
                }
            }
        }
        return out;
    }

    /** 순수 함수 - 소수 5자리(약 1m). */
    static double round5(double v) {
        return Math.round(v * 1e5) / 1e5;
    }

    /** 순수 함수 - (lat, lon) 에서 가장 가까운 경로 점({경도, 위도, 누적 거리})의 번호. 점이 없으면 -1. */
    static int nearIndex(double[][] points, double lat, double lon) {
        int best = -1;
        double bd = Double.POSITIVE_INFINITY;
        for (int i = 0; i < points.length; i++) {
            double d = distM(points[i], lat, lon);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    /** 순수 함수 - 경로 점 {경도, 위도, …} 와 (lat, lon) 사이 거리(m, 평면 근사). */
    static double distM(double[] p, double lat, double lon) {
        double k = Math.cos(Math.toRadians(lat));
        double dx = (p[0] - lon) * k, dy = p[1] - lat;
        return Math.sqrt(dx * dx + dy * dy) * 111_320.0;
    }

    /** 경로에서 이 거리(m) 안의 위치표지판만 보냅니다(경로 밖 다른 골짜기 표지를 빼려고). */
    static final double SIGN_NEAR_M = 80;   // 2026-10-10 PC: 150m 는 천왕봉 둘레에서 다른 길(칼바위 · 추성마을) 표지까지 잡혔음

    /** 코스 범위(+ 약 200m) 안의 표지를 한 번 읽고, 경로 점에서 SIGN_NEAR_M 안의 것만. */
    static JsonArray signsNear(Connection c, double[][] points, JsonObject course) throws Exception {
        JsonArray out = new JsonArray();
        if (points.length == 0 || !course.has("min_lat") || course.get("min_lat").isJsonNull()) return out;
        double pad = 0.002;
        double minLat = course.get("min_lat").getAsDouble() - pad, maxLat = course.get("max_lat").getAsDouble() + pad;
        double minLon = course.get("min_lon").getAsDouble() - pad * 1.25, maxLon = course.get("max_lon").getAsDouble() + pad * 1.25;
        try (PreparedStatement ps = c.prepareStatement("SELECT loc_no, place_name, ele_m, call_ok, lat, lon FROM route_signpost"
                + " WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? ORDER BY loc_no")) {
            ps.setDouble(1, minLat);
            ps.setDouble(2, maxLat);
            ps.setDouble(3, minLon);
            ps.setDouble(4, maxLon);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    double lat = rs.getDouble(5), lon = rs.getDouble(6);
                    if (nearLine(points, lat, lon) > SIGN_NEAR_M) continue;
                    JsonObject o = new JsonObject();
                    o.addProperty("loc_no", rs.getString(1));
                    o.addProperty("place_name", rs.getString(2));
                    int ele = rs.getInt(3);
                    if (rs.wasNull()) o.add("ele_m", JsonNull.INSTANCE); else o.addProperty("ele_m", ele);
                    o.addProperty("call_ok", rs.getString(4));
                    o.add("lat", new com.google.gson.JsonPrimitive(rs.getBigDecimal(5)));
                    o.add("lon", new com.google.gson.JsonPrimitive(rs.getBigDecimal(6)));
                    out.add(o);
                }
            }
        }
        return out;
    }

    /** 순수 함수 - (lat, lon) 에서 경로 점({경도, 위도, …})까지 가장 가까운 거리(m, 점 기준 - 점 간격이 촘촘해 충분). */
    static double nearLine(double[][] points, double lat, double lon) {
        int i = nearIndex(points, lat, lon);
        return i < 0 ? Double.POSITIVE_INFINITY : distM(points[i], lat, lon);
    }
}
