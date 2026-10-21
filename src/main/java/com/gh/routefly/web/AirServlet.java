package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 미세먼지. {@code GET /api/air?lat=35.79&lon=128.12} - 가장 가까운 대기 측정소의 지금 미세먼지 · 초미세먼지.
 * 2026-10-15 홍TV님: 산 소개 페이지 · fly(3D) 날씨 옆에.
 *
 * <ul>
 *   <li>공공데이터포털 한국환경공단 에어코리아 - 측정소 목록(MsrstnInfoInqireSvc getMsrstnList, 하루 담아 둠)에서 가장 가까운 곳(AIR_NEAR_M 안),
 *       그 측정소의 실시간 값(ArpltnInforInqireSvc getMsrstnAcctoRltmMesureDnsty, 30분 담아 둠).</li>
 *   <li>인증키 {@code air.serviceKey}, 없으면 {@code tour.serviceKey}(개인 키는 같고 서비스마다 활용 신청만 따로).
 *       없거나 실패하면 {@code {success:true, unavailable:true}}.</li>
 *   <li>좋음 · 보통 · 나쁨 · 매우나쁨은 받은 농도로 환경부 예보 기준에 맞춰 여기서 정합니다(PM10 30 · 80 · 150, PM2.5 15 · 35 · 75).</li>
 * </ul>
 * → {@code {success, station, time:"2026-10-15 14:00", dist_km, pm10, pm25, pm10Word, pm25Word, source}}
 */
@WebServlet(urlPatterns = {"/api/air"}, loadOnStartup = 1)   // 뜰 때 init 이 측정소 목록을 뒤에서 미리 받음
public class AirServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(AirServlet.class);

    static final String STATIONS_URL = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList";
    static final String MEASURE_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty";
    static final double AIR_NEAR_M = 40000;
    /**
     * 가까운 측정소부터 몇 곳까지 물어보는가 / 측정소마다 최근 몇 줄(시간)까지 보는가.
     * 2026-10-15 PC: 98개 산 가운데 7곳은 가장 가까운 측정소의 최근 3시간이 모두 "통신장애"(값 "-"),
     * 3곳(설악산 · 점봉산 · 황석산)은 가장 가까운 측정소 이름으로 물으면 0줄 - 다음 측정소로 넘어감.
     */
    static final int TRY_STATIONS = 3, ROWS = 6;
    /**
     * 측정소 목록(672곳). 2026-10-15 PC: 포털이 처음 한 번은 25초도 넘기고(HttpTimeoutException) 바로 다시 물으면 0.5초 -
     * 서블릿이 뜰 때 뒤에서 미리 받고(init - 실패하면 5 · 10 · 30분, 하루 한도면 자정까지 쉬었다 다시), 새로 받기에 실패하면 받아 둔 목록을 그대로 씁니다.
     * 측정소는 거의 바뀌지 않아 이레에 한 번 새로 받습니다.
     */
    static final Duration STATIONS_TIMEOUT = Duration.ofSeconds(25);
    static final long STATIONS_TTL_MS = 7L * 24 * 60 * 60 * 1000;
    /** {이름 목록, [위도, 경도] 목록, 받은 시각, 주소 목록} - 아직 못 받았으면 null. */
    private static volatile Object[] stationList;
    private static final ReentrantLock LOADING = new ReentrantLock();
    /** 측정소 목록을 못 받은 횟수 · 다음에 물어볼 때(2026-10-21 PC: 포털이 느릴 때 주말 산 미리 받기가 산마다 25초씩 다시 물어 경고가 쌓이고 포털에 부담). */
    private static volatile int fails;
    private static volatile long nextTry;
    private static volatile boolean fileTried;
    private static final OpenApi.Cache<JsonObject> MEASURE = new OpenApi.Cache<>(800, 30L * 60 * 1000);

    private transient volatile Thread warm;

    @Override
    public void init() {
        String key = key();
        if (key == null) return;
        Thread t = new Thread(() -> {
            // 받을 때까지: 실패하면 정한 쉬는 시간(5 · 10 · 30분, 하루 한도면 자정)이 지난 뒤 다시 - 말과 간격을 맞춤(2026-10-21 PC: "5분 뒤" 라 적고 30초 뒤 다시 물었음)
            for (int i = 0; i < 48; i++) {
                if (Thread.currentThread().isInterrupted()) return;
                if (stationList(key, System.currentTimeMillis()) != null) return;
                try {
                    Thread.sleep(Math.max(30_000L, nextTry - System.currentTimeMillis()));
                } catch (InterruptedException e) {
                    return;   // 웹앱이 내려감(destroy)
                }
            }
        }, "air-stations");
        t.setDaemon(true);
        warm = t;
        t.start();
    }

    /** 웹앱이 내려갈 때 미리 받기를 멈춤(2026-10-15 PC: 앞 웹앱이 내려간 뒤에도 그 스레드가 돌았음). 받는 중인 요청도 끊김(HttpClient.send 는 interrupt 를 받음). */
    @Override
    public void destroy() {
        Thread t = warm;
        if (t != null) t.interrupt();
    }

    /** 그 자리에서 가장 가까운 측정소 주소의 예보 지역(region) - 중기예보(MidServlet)도 씀. 측정소 목록이 없으면 null. */
    static String regionNear(double lat, double lon) {
        String key = key();
        Object[] st = key == null ? null : stationList(key, System.currentTimeMillis());
        if (st == null) return null;
        @SuppressWarnings("unchecked") List<double[]> pos = (List<double[]>) st[1];
        @SuppressWarnings("unchecked") List<String> addrs = (List<String>) st[3];
        List<Integer> near = nearest(pos, lat, lon, AIR_NEAR_M, 1);
        return near.isEmpty() ? null : region(addrs.get(near.get(0)));
    }

    static String key() {
        String key = RouteflyConfig.get("air.serviceKey");
        return key != null ? key : RouteflyConfig.get("tour.serviceKey");
    }

    /**
     * 측정소 목록 - 이레 안에 받은 것이 있으면 그것, 아니면 한 번 받아 봄. 실패하면 예전 목록(없으면 null).
     * 다른 요청이 받는 중이면 예전 목록을 바로 쓰고, 예전 목록도 없으면 10초까지만 기다립니다(화면이 오래 멈추지 않게).
     */
    private static Object[] stationList(String key, long now) {
        if (stationList == null && !fileTried) fromFile();
        Object[] cur = stationList;
        if (cur != null && now - (Long) cur[2] < STATIONS_TTL_MS) return cur;
        if (now < nextTry) return cur;   // 막 실패함 - 쉬는 동안은 묻지 않음(예전 목록 또는 null)
        long blocked = OpenApi.blockedUntil("AIR");
        if (blocked > now) { nextTry = blocked; return cur; }   // 하루 한도 등으로 막혀 있음 - 그때까지(로그 없이)
        try {
            if (cur != null ? !LOADING.tryLock() : !LOADING.tryLock(10, TimeUnit.SECONDS)) return cur;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return cur;
        }
        try {
            return loadStations(key, now);
        } finally {
            LOADING.unlock();
        }
    }

    private static Object[] loadStations(String key, long now) {
        Object[] cur = stationList;
        if (cur != null && now - (Long) cur[2] < STATIONS_TTL_MS) return cur;   // 기다리는 사이 다른 쪽이 받았음
        String text = OpenApi.get(STATIONS_URL + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                + "&returnType=json&numOfRows=1000&pageNo=1", "AIR", STATIONS_TIMEOUT);
        List<String> names = new ArrayList<>(), addrs = new ArrayList<>();
        List<double[]> pos = new ArrayList<>();
        if (text != null && stations(text, names, pos, addrs)) {
            stationList = new Object[] {names, pos, now, addrs};
            fails = 0;
            nextTry = 0;
            log.info("[AIR] 측정소 목록 {}곳 받음({})", names.size(), Thread.currentThread().getName());
            toFile(text);
            return stationList;
        }
        if (text != null) OpenApi.warn("AIR", text);   // 응답은 왔는데 목록이 아님(키 · 신청 문제)
        long blocked = OpenApi.blockedUntil("AIR");
        if (blocked > now + 60 * 60_000L) {   // 이번에 하루 한도에 걸림 - 자정까지(경고는 OpenApi 가 한 줄)
            nextTry = blocked;
            return cur;
        }
        fails++;
        nextTry = now + retryAfterMs(fails);
        log.warn("[AIR] 측정소 목록을 못 받음 {}번째 - {}분 뒤 다시({})", fails, retryAfterMs(fails) / 60000, cur != null ? "예전 목록 씀" : "그동안 대기질 · 지역 없이");
        return cur;
    }

    /** 순수 함수 - n 번 연달아 못 받은 뒤 쉬는 시간: 5 · 10 · 30분(그 뒤로 30분). */
    static long retryAfterMs(int n) {
        return n <= 0 ? 0 : n == 1 ? 5 * 60_000L : n == 2 ? 10 * 60_000L : 30 * 60_000L;
    }

    /** 받은 목록을 파일로(stats.dir/air-stations.json - 공개 자료) - 다시 켜도 바로 씀. 받은 날은 파일 시각. */
    private static java.nio.file.Path stationsFile() {
        return Stats.file().resolveSibling("air-stations.json");
    }

    private static void toFile(String text) {
        try {
            java.nio.file.Path f = stationsFile();
            java.nio.file.Files.createDirectories(f.getParent());
            java.nio.file.Files.writeString(f, text, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("[AIR] 측정소 목록 파일을 쓰지 못함 - {}", e.toString());
        }
    }

    private static synchronized void fromFile() {
        if (fileTried) return;
        fileTried = true;
        try {
            java.nio.file.Path f = stationsFile();
            if (!java.nio.file.Files.isRegularFile(f)) return;
            List<String> names = new ArrayList<>(), addrs = new ArrayList<>();
            List<double[]> pos = new ArrayList<>();
            if (stations(java.nio.file.Files.readString(f, StandardCharsets.UTF_8), names, pos, addrs)) {
                stationList = new Object[] {names, pos, java.nio.file.Files.getLastModifiedTime(f).toMillis(), addrs};   // 이레 지났으면 다음에 새로 받음
                log.info("[AIR] 측정소 목록 {}곳 파일에서 읽음", names.size());
            }
        } catch (Exception e) {
            log.warn("[AIR] 측정소 목록 파일을 읽지 못함 - {}", e.toString());
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        String key = key();
        JsonObject out = key == null ? unavailable() : answer(key, at[0], at[1]);
        // 못 받았을 때는 브라우저 · 서비스워커가 담아 두지 않게(2026-10-15 PC: 뜰 때 목록을 받는 사이 10초에 unavailable) - 다음에 다시 물음
        if (out.has("unavailable")) Json.write(resp, HttpServletResponse.SC_OK, out, false);
        else Json.ok(req, resp, out);
    }

    private static JsonObject answer(String key, double lat, double lon) {
        long now = System.currentTimeMillis();
        Object[] st = stationList(key, now);
        if (st == null) return unavailable();
        @SuppressWarnings("unchecked") List<String> names = (List<String>) st[0];
        @SuppressWarnings("unchecked") List<double[]> pos = (List<double[]>) st[1];
        @SuppressWarnings("unchecked") List<String> addrs = (List<String>) st[3];
        List<Integer> near = nearest(pos, lat, lon, AIR_NEAR_M, TRY_STATIONS);
        // 미세먼지 예보(오늘 · 내일 · 모레 - 시도 · 권역 등급, 2026-10-15 홍TV님: 며칠 뒤 산행 날의 미세먼지). 지역은 가장 가까운 측정소 주소로
        String region = near.isEmpty() ? null : region(addrs.get(near.get(0)));
        JsonObject fc = region == null ? null : forecast(key, region, now);
        for (int i : near) {
            String station = names.get(i);
            JsonObject m = MEASURE.get(station, now);
            if (m == null) {
                String text = OpenApi.get(MEASURE_URL + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                        + "&returnType=json&numOfRows=" + ROWS + "&pageNo=1&dataTerm=DAILY&ver=1.0&stationName=" + URLEncoder.encode(station, StandardCharsets.UTF_8), "AIR");
                if (text == null) continue;   // 시간 초과 · 실패 - 담아 두지 않고 다음 측정소
                m = measure(text);
                if (m == null) m = new JsonObject();   // 값 없음(통신장애 · 0줄)도 30분 담아 둠 - 매번 묻지 않게
                MEASURE.put(station, m, now);
            }
            if (m.size() == 0) continue;
            JsonObject out = m.deepCopy();
            out.addProperty("success", true);
            out.addProperty("station", station);
            out.addProperty("dist_km", Math.round(MountainServlet.distM(lat, lon, pos.get(i)[0], pos.get(i)[1]) / 100) / 10.0);
            out.addProperty("source", "에어코리아(한국환경공단)");
            withForecast(out, region, fc);
            return out;
        }
        return withForecast(unavailable(), region, fc);
    }

    private static JsonObject withForecast(JsonObject out, String region, JsonObject fc) {
        if (fc != null && fc.size() > 0) {
            out.addProperty("region", region);
            out.add("forecast", fc);
        }
        return out;
    }

    static final String FORECAST_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth";
    /** 발표일(KST) → 응답 글. 하루 네 번(5 · 11 · 17 · 23시) 발표 - 1시간 담아 둠. */
    private static final OpenApi.Cache<String> FORECAST = new OpenApi.Cache<>(4, 60L * 60 * 1000);

    /** 그 지역의 날짜별 예보 {"2026-10-16":{"pm10":"보통","pm25":"좋음"}} - 못 받으면 null. */
    private static JsonObject forecast(String key, String region, long now) {
        String day = java.time.LocalDate.now(WeatherServlet.KST).toString();
        String text = FORECAST.get(day, now);
        if (text == null) {
            text = OpenApi.get(FORECAST_URL + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                    + "&returnType=json&numOfRows=100&pageNo=1&ver=1.1&searchDate=" + day, "AIR");
            if (text == null || items(text) == null) {
                if (text != null) OpenApi.warn("AIR", text);
                return null;
            }
            FORECAST.put(day, text, now);
        }
        return forecastFor(text, region);
    }

    /**
     * 순수 함수 - 예보 응답 → 그 지역의 날짜별 등급. 같은 날짜 · 항목(PM10 · PM25)이 여러 번 발표됐으면 가장 늦은 발표(dataTime).
     * informGrade 는 "서울 : 보통,제주 : 좋음,…".
     */
    static JsonObject forecastFor(String text, String region) {
        JsonArray list = items(text);
        JsonObject out = new JsonObject();
        if (list == null || region == null) return out;
        java.util.Map<String, String> seen = new java.util.HashMap<>();
        for (JsonElement e : list) {
            if (!e.isJsonObject()) continue;
            JsonObject o = e.getAsJsonObject();
            String code = str(o, "informCode"), date = str(o, "informData"), at = str(o, "dataTime"), grades = str(o, "informGrade");
            if (code == null || date == null || grades == null || !(code.equals("PM10") || code.equals("PM25"))) continue;
            String k = date + "|" + code;
            if (seen.containsKey(k) && at != null && seen.get(k).compareTo(at) >= 0) continue;
            for (String part : grades.split(",")) {
                String[] kv = part.split(":");
                if (kv.length == 2 && kv[0].trim().equals(region)) {
                    String g = kv[1].trim();
                    if (!g.matches("좋음|보통|나쁨|매우나쁨")) break;
                    seen.put(k, at == null ? "" : at);
                    if (!out.has(date)) out.add(date, new JsonObject());
                    out.getAsJsonObject(date).addProperty(code.equals("PM10") ? "pm10" : "pm25", g);
                    break;
                }
            }
        }
        return out;
    }

    /** 경기 북부 · 강원 영동 시군(에어코리아 예보 권역). */
    private static final String[] GG_NORTH = {"고양", "파주", "의정부", "양주", "동두천", "포천", "연천", "가평", "남양주", "구리"};
    private static final String[] GW_EAST = {"강릉", "동해", "삼척", "속초", "고성", "양양", "태백"};

    /** 순수 함수 - 측정소 주소 → 에어코리아 예보 지역(서울 · 경기북부 · 경기남부 · 영동 · 영서 · 경남 …). 모르면 null. */
    static String region(String addr) {
        if (addr == null || addr.isBlank()) return null;
        String[] w = addr.trim().split("\\s+");
        String sido = w[0], city = w.length > 1 ? w[1] : "";
        String[][] map = {{"서울", "서울"}, {"부산", "부산"}, {"대구", "대구"}, {"인천", "인천"}, {"광주", "광주"}, {"대전", "대전"}, {"울산", "울산"},
                {"세종", "세종"}, {"제주", "제주"}, {"충청북", "충북"}, {"충북", "충북"}, {"충청남", "충남"}, {"충남", "충남"}, {"전라북", "전북"}, {"전북", "전북"},
                {"전라남", "전남"}, {"전남", "전남"}, {"경상북", "경북"}, {"경북", "경북"}, {"경상남", "경남"}, {"경남", "경남"}};
        if (sido.startsWith("경기")) {
            for (String c : GG_NORTH) if (city.startsWith(c)) return "경기북부";
            return "경기남부";
        }
        if (sido.startsWith("강원")) {
            for (String c : GW_EAST) if (city.startsWith(c)) return "영동";
            return "영서";
        }
        for (String[] m : map) if (sido.startsWith(m[0])) return m[1];
        return null;
    }

    private static JsonObject unavailable() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("unavailable", true);
        return o;
    }

    /** 응답의 줄들 - {@code response.body.items} 가 배열이거나 {@code items.item} 인 두 모양 모두. 모양이 다르거나 resultCode 가 00 이 아니면 null. */
    static JsonArray items(String text) {
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            JsonElement code = r.getAsJsonObject("header").get("resultCode");
            if (code == null || !"00".equals(code.getAsString())) return null;
            JsonElement it = r.getAsJsonObject("body").get("items");
            if (it != null && it.isJsonObject()) it = it.getAsJsonObject().get("item");
            if (it == null || it.isJsonNull()) return new JsonArray();
            if (it.isJsonArray()) return it.getAsJsonArray();
            JsonArray one = new JsonArray();
            one.add(it);
            return one;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 순수 함수 - 측정소 목록 → 이름 · [위도, 경도] · 주소(예보 지역을 정하는 데). dmX · dmY 중 어느 쪽이 위도인지는 값의 범위로 봅니다(위도 33~39 · 경도 124~132).
     * 읽은 측정소가 하나도 없으면 false.
     */
    static boolean stations(String text, List<String> names, List<double[]> pos, List<String> addrs) {
        JsonArray list = items(text);
        if (list == null) return false;
        for (JsonElement e : list) {
            if (!e.isJsonObject()) continue;
            JsonObject o = e.getAsJsonObject();
            String n = str(o, "stationName");
            Double x = num(str(o, "dmX")), y = num(str(o, "dmY"));
            if (n == null || x == null || y == null) continue;
            double la = x < 90 ? x : y, lo = x < 90 ? y : x;
            if (la < 32 || la > 40 || lo < 123 || lo > 133) continue;
            names.add(n);
            pos.add(new double[] {la, lo});
            addrs.add(str(o, "addr") != null ? str(o, "addr") : "");
        }
        return !names.isEmpty();
    }

    /** 순수 함수 - maxM 안 측정소의 차례, 가까운 것부터 n 곳. */
    static List<Integer> nearest(List<double[]> pos, double lat, double lon, double maxM, int n) {
        List<double[]> hit = new ArrayList<>();
        for (int i = 0; i < pos.size(); i++) {
            double d = MountainServlet.distM(lat, lon, pos.get(i)[0], pos.get(i)[1]);
            if (d <= maxM) hit.add(new double[] {i, d});
        }
        hit.sort((a, b) -> Double.compare(a[1], b[1]));
        List<Integer> out = new ArrayList<>();
        for (int k = 0; k < hit.size() && k < n; k++) out.add((int) hit.get(k)[0]);
        return out;
    }

    /** 순수 함수 - 실시간 값(최근 줄부터, 미세먼지 · 초미세먼지 중 하나라도 있는 첫 줄). 없으면 null. */
    static JsonObject measure(String text) {
        JsonArray list = items(text);
        if (list == null) return null;
        for (JsonElement e : list) {
            if (!e.isJsonObject()) continue;
            JsonObject o = e.getAsJsonObject();
            Double p10 = num(str(o, "pm10Value")), p25 = num(str(o, "pm25Value"));
            if (p10 == null && p25 == null) continue;
            JsonObject out = new JsonObject();
            out.addProperty("time", str(o, "dataTime"));
            if (p10 != null) {
                out.addProperty("pm10", (int) Math.round(p10));
                out.addProperty("pm10Word", word(p10, 30, 80, 150));
            }
            if (p25 != null) {
                out.addProperty("pm25", (int) Math.round(p25));
                out.addProperty("pm25Word", word(p25, 15, 35, 75));
            }
            return out;
        }
        return null;
    }

    /** 순수 함수 - 환경부 예보 등급(좋음 · 보통 · 나쁨 · 매우나쁨). */
    static String word(double v, double good, double normal, double bad) {
        return v <= good ? "좋음" : v <= normal ? "보통" : v <= bad ? "나쁨" : "매우나쁨";
    }

    private static Double num(String s) {
        if (s == null) return null;
        try {
            double d = Double.parseDouble(s.trim());
            return Double.isFinite(d) && d >= 0 ? d : null;
        } catch (NumberFormatException e) {
            return null;   // "-" (점검 · 통신 장애)
        }
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString().trim();
    }
}
