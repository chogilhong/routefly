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
 * 내 둘레 NEAR_KM 안 지점의 레이더 강우강도(HSP, mm/h)를 봅니다. 지도 그림이 아니라 지점 값이라 받는 양이 작고, 서버가 PUMP_MIN 분마다 미리 받아 모두가 나눠 씀(새 시각일 때만 물음).
 * 지점 위경도는 지상관측 지점정보(stn_inf inf=AWS)를 저장소에 담은 것(radar/kma-aws-stn.csv). 키 kma.apihub.key(없으면 이 칸 없음).
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

    /** AWS 지점 위경도 - 저장소에 담은 것(src/main/resources/radar/kma-aws-stn.csv). API허브 지점정보는 느려(2026-11-14 PC) 부르지 않음 - 지점이 바뀌면 RadarProbe 로 다시 받아 옮김. */
    private static volatile Map<Integer, double[]> stn;

    /** 순수 함수 - kma-aws-stn.csv 글(stn,위도,경도) → 지점번호 → {위도, 경도}. */
    static Map<Integer, double[]> bundled(String csv) {
        Map<Integer, double[]> out = new HashMap<>();
        if (csv == null) return out;
        for (String l : csv.split("\\R")) {
            String[] f = l.split(",");
            if (l.startsWith("#") || f.length != 3) continue;
            try {
                out.put(Integer.parseInt(f[0].trim()), new double[] {Double.parseDouble(f[1].trim()), Double.parseDouble(f[2].trim())});
            } catch (NumberFormatException e) {
                // 그 줄만 뺌
            }
        }
        return out;
    }

    private static Map<Integer, double[]> stn() {
        Map<Integer, double[]> s = stn;
        if (s != null) return s;
        try (java.io.InputStream in = Radar.class.getResourceAsStream("/radar/kma-aws-stn.csv")) {
            s = bundled(in == null ? null : new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (java.io.IOException e) {
            s = new HashMap<>();
        }
        stn = s;
        return s;
    }

    /** 물을 시각 - 20분 전을 10분 단위로 내림(합성은 10분마다, 늦게 나올 수 있어 여유). KST yyyyMMddHHmm. RadarProbe · fresh 기준. */
    static String slot(LocalDateTime now) {
        return slot(now, 20);
    }

    /** back 분 전을 10분 단위로 내림. 미리 받기는 10분 전을 먼저 묻고, 아직 없으면 20분 전(2026-11-14 홍TV님 "작업해줘" - 자료를 10분 더 최신으로). */
    static String slot(LocalDateTime now, int back) {
        LocalDateTime t = now.minusMinutes(back);
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

    /** 미리 받기 간격(분) · 기다리는 시간 · 이보다 오래된 자료는 안 보임(분, 자료 시각 기준). */
    static final int PUMP_MIN = 1, STALE_MIN = 30;   // 1분마다 보되 새 시각일 때만 물음 - 실패하면 1분 뒤 다시(OpenApi 가 연달아 실패하면 5 · 15분 쉼)
    static final Duration TIMEOUT = Duration.ofSeconds(60);   // 2026-11-14 PC: API허브가 8초 · 30초도 넘겨(HttpTimeoutException) rain 이 빠졌음 - 화면은 안 기다리니 넉넉히

    /** 가장 최근에 받은 것 {자료 시각 tm, Map 지점 → mm/h, 받은 때 ms, 같은 시각을 다시 받았나}. */
    private static volatile Object[] latest;
    private static java.util.concurrent.ScheduledExecutorService pump;

    /** 같은 시각을 다시 받기까지(분) - 막 나온 자료는 늦게 채워지는 지점이 있어(2026-11-14 PC: 같은 15:20 인데 운영 3곳 · 로컬 4곳) 한 번만 다시. */
    static final int AGAIN_MIN = 3;

    /** 순수 함수 - latest 를 같은 시각으로 한 번 더 받을 때인가(아직 안 했고, 받은 지 AGAIN_MIN 분 지남). */
    static boolean again(Object[] l, long nowMs) {
        return l != null && l.length >= 4 && !Boolean.TRUE.equals(l[3]) && nowMs - (Long) l[2] >= AGAIN_MIN * 60_000L;
    }

    /**
     * 순수 함수 - 자료 시각 tm 이 지금 물을 시각(slot)보다 STALE_MIN 분 넘게 늦지 않았나(yyyyMMddHHmm). 미리 받기가 계속 실패하면 옛 비를 지금 비처럼 보이지 않게.
     */
    static boolean fresh(String tm, String nowSlot) {
        DateTimeFormatter f = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        return !LocalDateTime.parse(tm, f).isBefore(LocalDateTime.parse(nowSlot, f).minusMinutes(STALE_MIN));
    }

    /**
     * 지금 내 둘레(키가 없거나 아직 · 오래 못 받았으면 null). 화면 요청은 기다리지 않음 - 서버가 PUMP_MIN 분마다 미리 받아 둔 것만 씀(2026-11-14 PC 제안).
     * 미리 받기는 웹앱이 뜰 때(DbShutdown.contextInitialized) 시작 - 처음 불릴 때도 한 번 더 확인.
     */
    @SuppressWarnings("unchecked")
    static JsonObject at(double lat, double lon) {
        if (RouteflyConfig.get("kma.apihub.key") == null) return null;
        start();
        Object[] l = latest;
        Map<Integer, double[]> stn = stn();
        if (l == null || stn.isEmpty() || !fresh((String) l[0], slot(LocalDateTime.now(WeatherServlet.KST)))) return null;
        return near((Map<Integer, Double>) l[1], stn, lat, lon, (String) l[0]);
    }

    /** 미리 받기 시작(키가 없으면 하지 않음). */
    static synchronized void start() {
        if (pump != null || RouteflyConfig.get("kma.apihub.key") == null) return;
        pump = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "radar-pump");
            t.setDaemon(true);
            return t;
        });
        pump.scheduleWithFixedDelay(Radar::refresh, 0, PUMP_MIN, java.util.concurrent.TimeUnit.MINUTES);
    }

    /** 웹앱이 내려갈 때(DbShutdown) - 미리 받기 스레드를 멈춤. */
    static synchronized void shutdown() {
        if (pump != null) pump.shutdownNow();
        pump = null;
    }

    /**
     * 한 번 미리 받기 - 새 시각의 지점값만(10분 전 → 없으면 20분 전, 탭 이름을 따로 두어 한쪽 실패 쉼이 다른 쪽을 막지 않게).
     * 실패하면 다음 차례(1분 뒤)에, 옛 것은 STALE_MIN 까지 그대로.
     */
    static void refresh() {
        try {
            String key = RouteflyConfig.get("kma.apihub.key");
            if (key == null) return;
            String k = "&qcd=EXT&cmp=HSP&authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
            LocalDateTime now = LocalDateTime.now(WeatherServlet.KST);
            for (int back : new int[] {10, 20}) {   // 10분 전이 아직 안 나왔으면 20분 전 - 이미 가진 것보다 새것만
                String tm = slot(now, back);
                Object[] l = latest;
                boolean again = l != null && tm.equals(l[0]) && again(l, System.currentTimeMillis());
                if (l != null && tm.compareTo((String) l[0]) <= 0 && !again) return;
                Map<Integer, Double> e = echoes(OpenApi.get(BASE + "cgi-bin/url/nph-rdr_cmp_aws_all_pt_data?tm=" + tm + k, back == 10 ? "RADAR" : "RADAR-20", TIMEOUT));
                if (again) {   // 같은 시각을 한 번 더 - 더 많이 채워진 쪽을 씀(이번 것이 적어도 다시 묻지 않음)
                    latest = e.size() > ((Map<?, ?>) l[1]).size() ? new Object[] {tm, e, l[2], Boolean.TRUE} : new Object[] {l[0], l[1], l[2], Boolean.TRUE};
                    return;
                }
                if (!e.isEmpty()) {
                    latest = new Object[] {tm, e, System.currentTimeMillis(), Boolean.FALSE};
                    return;
                }
            }
        } catch (RuntimeException ex) {
            // 다음 차례에(스레드가 멈추지 않게)
        }
    }
}
