package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 🌧 레이더 비구름(2026-11-14 홍TV님 "레이더 비구름 추가해줘") - 기상청 API허브 「레이더 AWS지점별 합성자료값」 지점모두(전국 AWS 약 500곳, 10분)에서
 * 내 둘레 NEAR_KM 안 지점의 레이더 강우강도(HSP, mm/h)를 봅니다. 지도 그림이 아니라 지점 값이라 받는 양이 작고, 서버가 10분에 한 번만 묻고 모두가 나눠 씀.
 * 지점 위경도는 지상관측 지점정보(stn_inf inf=AWS, 하루 한 번). 키 kma.apihub.key(없으면 이 칸 없음).
 * 응답 모양은 web.RadarProbe 가 받은 실제 응답(src/test/resources/radar/, 2026-11-14 13:50 - 비 값 387곳).
 * SafetyServlet(/api/safety) 의 rain 칸으로 나감 → 별거 별거 · 산 페이지 · 따라가기 안전 줄(course-kit safetyRows).
 */
final class Radar {

    private Radar() {
    }

    static final String BASE = "https://apihub.kma.go.kr/api/typ01/";
    /** 둘레 거리(km). */
    static final double NEAR_KM = 15;
    /** 이만큼(mm/h) 넘어야 비로 셈 - API허브 레이더 평가기준 0.1mm(nph-rdr_cmp1_img 의 eva 2). */
    static final double RAIN_MMH = 0.1;
    /** ECHO 의 "강수없음"(API허브 설명: -250 강수없음, -300 관측반경 밖). -200 등 설명에 없는 값은 모름으로 보고 뺌. */
    static final double NO_RAIN = -250;

    private static final OpenApi.Cache<Object> CACHE = new OpenApi.Cache<>(8, 15L * 60 * 1000), STN = new OpenApi.Cache<>(2, 24L * 60 * 60 * 1000);

    /** 물을 시각 - 20분 전을 10분 단위로 내림(합성은 10분마다, 늦게 나올 수 있어 여유). KST yyyyMMddHHmm. RadarProbe 도 씀. */
    static String slot(LocalDateTime now) {
        LocalDateTime t = now.minusMinutes(20);
        return t.withMinute(t.getMinute() / 10 * 10).format(DateTimeFormatter.ofPattern("yyyyMMddHHmm"));
    }

    /** 순수 함수 - 지점모두 글 → 지점번호 → 강우강도(mm/h, 강수없음은 0). 설명에 없는 음수(-200 등) · -300(반경 밖)은 뺌. # 줄은 설명. */
    static Map<Integer, Double> echoes(String text) {
        Map<Integer, Double> out = new HashMap<>();
        if (text == null) return out;
        for (String l : text.split("\\R")) {
            if (l.startsWith("#") || l.isBlank()) continue;
            String[] f = l.split(",");
            if (f.length < 5 || !f[1].trim().matches("\\d+")) continue;
            double v;
            try {
                v = Double.parseDouble(f[4].trim());
            } catch (NumberFormatException e) {
                continue;
            }
            if (v >= 0) out.put(Integer.parseInt(f[1].trim()), v);
            else if (v == NO_RAIN) out.put(Integer.parseInt(f[1].trim()), 0.0);
        }
        return out;
    }

    /** 순수 함수 - stn_inf(AWS) 글 → 지점번호 → {위도, 경도}. 칸: STN LON LAT … (빈칸으로 나눔). */
    static Map<Integer, double[]> stations(String text) {
        Map<Integer, double[]> out = new HashMap<>();
        if (text == null) return out;
        for (String l : text.split("\\R")) {
            if (l.startsWith("#") || l.isBlank()) continue;
            String[] f = l.trim().split("\\s+");
            if (f.length < 3 || !f[0].matches("\\d+")) continue;
            try {
                out.put(Integer.parseInt(f[0]), new double[] {Double.parseDouble(f[2]), Double.parseDouble(f[1])});
            } catch (NumberFormatException e) {
                // 그 줄만 뺌
            }
        }
        return out;
    }

    static final String[] DIRS = {"북", "북동", "동", "남동", "남", "남서", "서", "북서"};

    /** 순수 함수 - a 에서 본 b 의 방향(8방위). */
    static String dir(double aLat, double aLon, double bLat, double bLon) {
        double y = Math.sin(Math.toRadians(bLon - aLon)) * Math.cos(Math.toRadians(bLat));
        double x = Math.cos(Math.toRadians(aLat)) * Math.sin(Math.toRadians(bLat)) - Math.sin(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat)) * Math.cos(Math.toRadians(bLon - aLon));
        double deg = (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
        return DIRS[(int) Math.round(deg / 45) % 8];
    }

    static double km(double aLat, double aLon, double bLat, double bLon) {
        double r = Math.toRadians(bLat - aLat), q = Math.toRadians(bLon - aLon);
        double h = Math.sin(r / 2) * Math.sin(r / 2) + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat)) * Math.sin(q / 2) * Math.sin(q / 2);
        return 2 * 6371 * Math.asin(Math.sqrt(h));
    }

    /**
     * 순수 함수 - 내 자리 둘레 → {tm "HH:mm", seen 본 지점 수, rain [{km, dir, mmh}] 가까운 순 3곳까지, count 비 오는 지점 수, max mm/h}.
     * 둘레에 값 있는 지점이 하나도 없으면 null(모름 - "비 없음" 이라고 하지 않음).
     */
    static JsonObject near(Map<Integer, Double> echo, Map<Integer, double[]> stn, double lat, double lon, String tm) {
        List<double[]> wet = new ArrayList<>();   // {km, mmh, 위도, 경도}
        int seen = 0;
        for (Map.Entry<Integer, Double> e : echo.entrySet()) {
            double[] p = stn.get(e.getKey());
            if (p == null) continue;
            double d = km(lat, lon, p[0], p[1]);
            if (d > NEAR_KM) continue;
            seen++;
            if (e.getValue() >= RAIN_MMH) wet.add(new double[] {d, e.getValue(), p[0], p[1]});
        }
        if (seen == 0) return null;
        wet.sort((a, b) -> Double.compare(a[0], b[0]));
        JsonObject o = new JsonObject();
        o.addProperty("tm", tm.substring(8, 10) + ":" + tm.substring(10, 12));
        o.addProperty("seen", seen);
        o.addProperty("count", wet.size());
        JsonArray arr = new JsonArray();
        double max = 0;
        for (double[] w : wet) {
            max = Math.max(max, w[1]);
            if (arr.size() >= 3) continue;
            JsonObject r = new JsonObject();
            r.addProperty("km", Math.round(w[0] * 10) / 10.0);
            r.addProperty("dir", w[0] < 1 ? "" : dir(lat, lon, w[2], w[3]));   // 1km 안은 "바로 여기"
            r.addProperty("mmh", Math.round(w[1] * 10) / 10.0);
            arr.add(r);
        }
        o.add("rain", arr);
        o.addProperty("max", Math.round(max * 10) / 10.0);
        return o;
    }

    /** 지금 내 둘레(키 · 응답이 없으면 null). 지점모두는 시각마다 한 번, 지점 정보는 하루 한 번 받음(Flight - 같은 것을 한 번만). */
    @SuppressWarnings("unchecked")
    static JsonObject at(double lat, double lon) {
        String key = RouteflyConfig.get("kma.apihub.key");
        if (key == null) return null;
        String k = "&authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
        long now = System.currentTimeMillis();
        Map<Integer, double[]> stn = (Map<Integer, double[]>) STN.get("aws", now);
        if (stn == null) {
            stn = Flight.once("radar|stn", () -> {
                Map<Integer, double[]> s = stations(OpenApi.get(BASE + "url/stn_inf.php?inf=AWS" + k, "RADAR-STN", Duration.ofSeconds(15)));
                if (!s.isEmpty()) STN.put("aws", s, now);
                return s;
            });
        }
        if (stn == null || stn.isEmpty()) return null;
        String tm = slot(LocalDateTime.now(WeatherServlet.KST));
        Map<Integer, Double> echo = (Map<Integer, Double>) CACHE.get(tm, now);
        if (echo == null) {
            echo = Flight.once("radar|" + tm, () -> {
                Map<Integer, Double> e = echoes(OpenApi.get(BASE + "cgi-bin/url/nph-rdr_cmp_aws_all_pt_data?tm=" + tm + "&qcd=EXT&cmp=HSP" + k, "RADAR"));
                if (!e.isEmpty()) CACHE.put(tm, e, now);
                return e;
            });
        }
        return echo == null || echo.isEmpty() ? null : near(echo, stn, lat, lon, tm);
    }
}
