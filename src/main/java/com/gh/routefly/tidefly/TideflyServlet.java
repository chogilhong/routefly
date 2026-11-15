package com.gh.routefly.tidefly;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 타이드플라이(tidefly.html - 2026-11-15 홍TV님 "tidefly 를 routefly 앱 안의 기능으로 전부 옮겨줘", 예전 chogilhong/tidefly 저장소 v0.10.1).
 * GET /api/tidefly?name=&lt;포인트 이름&gt; → 그 포인트의 지금 바다(소해구 예측 · 해상 특보)와 ○ / △ / ✕ (Verdict).
 * GET /api/tidefly?name=…&amp;detail=1 → 위에 더해 15일 물때표(물때 · 높이 차 · 일출몰 · 음력 · 물때 이름)과 앞으로 72시간 3시간 간격 바다 예측(hourly - 그때 받음, 6시간 기억).
 * GET /api/tidefly?spots=1 → 갯바위 · 선상 자리(data/tidefly-spots.json, 1,405곳 - 📍 내 근처 · 찾기에서만 보임, 2026-11-15 홍TV님 "2번으로")와
 *   marks {id: {mark, reasons}} - extra(그 자리만 더 걸리는 먼바다)가 있는 자리만. 나머지는 화면이 base 포인트 판단을 그대로 씀. 위치는 받지 않음(화면이 폰 안에서 셈).
 * GET /api/tidefly?find=이름 → {"hit": true, "q": 맞은 이름(bare 꼴)} 또는 {"hit": false} - 코스 모음 찾기(js/mountain.js)가 산 이름이 아닐 때 낚시 포인트 · 자리 이름인지 물음({@link #find}).
 * GET /api/tidefly → 모든 포인트(화면 목록용). 서버가 미리 받아 둔 것만 써서 바로 답합니다(받는 중인 곳은 sea 없이 "받는 중").
 * 물때: 포인트마다 가장 가까운 조석 예보지점(points.json 의 tide)의 오늘 · 내일(우리 날짜) 만조 · 간조(응답 칸 tides - 밤에도 다음 물때를 보이려고) - 국립해양조사원 조석예보(고, 저조), 키 portal.serviceKey, 지점 · 날짜마다 6시간 기억.
 * 미리 받기: 웹앱이 뜬 뒤 1초부터 10분마다 특보 · 모든 포인트 소해구 예측 · 물때(기억이 있으면 부르지 않음 - 칸마다 1시간, 3시간마다 발효 시각이 바뀌면 새로).
 * 포인트는 data/tidefly-points.json(바다낚시지수 49곳), 특보구역 짝은 data/tidefly-point-wrn.json({이름: [S 코드, …]} - 홍TV님 확인 뒤 채움, 비면 판단하지 않음).
 * 기상청 API허브(키 kma.apihub.key)는 서버가 부르고 잠시 기억합니다: 소해구 예측은 칸마다 1시간, 특보는 전체 한 번에 10분.
 */
@WebServlet("/api/tidefly")
public final class TideflyServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(TideflyServlet.class);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    static final String BASE = "https://apihub.kma.go.kr/api/";
    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyyMMddHH");
    private static final long SEA_TTL = 60 * 60_000L;
    private static final long WRN_TTL = 10 * 60_000L;
    private static final long TIDE_TTL = 6 * 60 * 60_000L;
    /** 물때를 받아 두는 날 수(오늘 포함) - 물 세기 %(15일 중 가장 센 날 대비)에 씀. 물때는 대략 15일 주기. */
    static final int TIDE_DAYS = 15;
    /** 자세히 보기의 날 수 · 예측 시간. */
    static final int DETAIL_DAYS = 15;   // 물때표(2026-11-15 홍TV님) - 미리 받아 두는 TIDE_DAYS 와 같음
    static final int HOURLY_HOURS = 72;
    private static final java.util.concurrent.ExecutorService DETAIL_POOL = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "tidefly-detail");
        t.setDaemon(true);
        return t;
    });
    static final String TIDE_URL = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";
    private static final java.time.ZoneId KST = java.time.ZoneId.of("Asia/Seoul");

    /** 기억: 열쇠 → [받은 시각, 값]. */
    private static final Map<String, Object[]> CACHE = new ConcurrentHashMap<>();

    private volatile Map<String, JsonObject> points;
    private volatile JsonObject regs;
    private transient ScheduledExecutorService timer;
    /** 특보만 따로 10분마다(2026-11-15: 15일치 물때를 처음 받는 바퀴가 10분 넘게 걸려, 바퀴 앞에서만 받던 특보가 20분 넘게 묵을 수 있었음 → 목록 판단 멈춤). */
    private transient ScheduledExecutorService wrnTimer;
    /** 미리 받기가 도는 중인지 - 목록이 빈 칸을 보면 바로 한 바퀴 더 돌리되 겹치지 않게(2026-11-14 PC: 재시작 직후 16곳이 한참 비어 있었음). */
    private final java.util.concurrent.atomic.AtomicBoolean warming = new java.util.concurrent.atomic.AtomicBoolean();
    /** 마지막 미리 받기가 끝난 때 - 못 받는 자료가 있어도 목록이 1분에 한 번만 다시 돌리게(기상청 · 포털에 같은 실패를 쏟지 않으려고). */
    private volatile long lastWarmEnd;
    /** 뜬 뒤 첫 바퀴인지 - 첫 바퀴는 새로 물은 것이 0건이어도 로그 한 줄(2026-11-15 PC: 파일에서 다 읽으면 [TIDE] 줄이 없어 확인이 어려움). */
    private volatile boolean firstWarm = true;

    @Override
    public void init() {
        timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "tidefly-sea");
            t.setDaemon(true);
            return t;
        });
        timer.scheduleWithFixedDelay(this::warm, 1, 600, TimeUnit.SECONDS);
        wrnTimer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "tidefly-wrn");
            t.setDaemon(true);
            return t;
        });
        wrnTimer.scheduleWithFixedDelay(() -> {
            try {
                String key = com.gh.routefly.web.RouteflyConfig.get("kma.apihub.key");
                if (key != null) warnings(key, System.currentTimeMillis(), true);
            } catch (RuntimeException e) {
                log.warn("[TIDEFLY-WRN] 특보 받기 실패 - {}", e.toString());
            }
        }, 0, 600, TimeUnit.SECONDS);
    }

    @Override
    public void destroy() {
        if (timer != null) timer.shutdownNow();
        if (wrnTimer != null) wrnTimer.shutdownNow();
        // 2026-11-15 PC: F5 다시 읽기 때 톰캣이 "tidefly-detail 쓰레드를 중지시키지 못함(메모리 누수 가능)" x 4 - 3일 예보 일꾼도 멈춤
        DETAIL_POOL.shutdownNow();
    }

    /** 미리 받기 한 바퀴 - 포인트마다 소해구 예측(같은 칸은 한 번, 사이 0.3초) · 물때(특보는 wrnTimer 가 따로). */
    private void warm() {
        if (!warming.compareAndSet(false, true)) return;
        try {
            String key = com.gh.routefly.web.RouteflyConfig.get("kma.apihub.key");
            if (key == null) return;
            ZonedDateTime nowUtc = ZonedDateTime.now(ZoneOffset.UTC);
            int asked = 0, failed = 0;
            for (JsonObject p : points().values()) {
                int lz = p.get("lzone").getAsInt(), sz = p.get("szone").getAsInt();
                if (cachedSea(lz, sz, nowUtc) != null) continue;
                asked++;
                if (sea(key, lz, sz, nowUtc, System.currentTimeMillis()) == null) failed++;
                Thread.sleep(300);
            }
            if (asked > 0) log.info("[TIDEFLY-SEA] 미리 받기 - 새로 물은 칸 {} · 못 받은 칸 {}", asked, failed);
            String pkey = portalKey();
            if (pkey != null) {
                java.time.LocalDate today = java.time.LocalDate.now(KST);
                int dropped = dropOldTides(cacheDir(), today);
                if (firstWarm) log.info("[TIDEFLY-TIDE] 물때 파일 폴더 {} - 파일 {}개(지난 것 {}개 지움)", cacheDir(), tideFiles(cacheDir()), dropped);
                int tAsked = 0, tFailed = 0;
                for (String code : new java.util.TreeSet<>(points().values().stream().map(p -> p.get("tide").getAsString()).toList())) {
                    for (java.time.LocalDate day : List.of(today, today.plusDays(1))) {
                        if (cachedTide(code, day) != null) continue;
                        tAsked++;
                        boolean ok = tide(pkey, code, day) != null;
                        if (!ok) tFailed++;
                        // 2026-11-15 PC(11:18): 오늘 · 내일 받기에서도 503 14번 - 1초 간격, 실패하면 5초 쉼
                        Thread.sleep(ok ? 1000 : 5000);
                    }
                }
                if (tAsked > 0) log.info("[TIDEFLY-TIDE] 미리 받기(오늘 · 내일) - 새로 물은 지점 · 날 {} · 못 받은 것 {}", tAsked, tFailed);
                int nearAsked = tAsked, nearFailed = tFailed;
                // 사흘째부터 15일째까지는 뒤에(목록은 오늘 · 내일만 기다림 - 물 세기 % 만 늦게 채워짐).
                // 포털이 불안정하면(연달아 5번 실패) 이번 바퀴는 멈춤 - 다음 바퀴(10분 뒤)에 이어서
                int row = 0;
                late:
                for (String code : new java.util.TreeSet<>(points().values().stream().map(p -> p.get("tide").getAsString()).toList())) {
                    for (int i = 2; i < TIDE_DAYS; i++) {
                        java.time.LocalDate day = today.plusDays(i);
                        if (cachedTide(code, day) != null) continue;
                        tAsked++;
                        boolean ok = tide(pkey, code, day) != null;
                        if (!ok) {
                            tFailed++;
                            if (++row >= 5) {
                                log.info("[TIDEFLY-TIDE] 연달아 5번 실패 - 남은 날은 다음 바퀴에");
                                break late;
                            }
                        } else {
                            row = 0;
                        }
                        if ((tAsked - nearAsked) % 100 == 0) log.info("[TIDEFLY-TIDE] 15일치 받는 중 - {}번 물음 · 못 받은 것 {}", tAsked - nearAsked, tFailed - nearFailed);
                        Thread.sleep(ok ? 1500 : 5000);   // 2026-11-15 PC: 0.3 · 1초 간격에도 포털이 503 - 뒤의 날은 1.5초, 실패하면 5초 쉼
                    }
                }
                if (tAsked > nearAsked) log.info("[TIDEFLY-TIDE] 미리 받기(15일치) - 새로 물은 지점 · 날 {} · 못 받은 것 {}", tAsked - nearAsked, tFailed - nearFailed);
                if (firstWarm && tAsked == 0) log.info("[TIDEFLY-TIDE] 미리 받기 - 새로 물은 것 0(물때 {}일치를 모두 파일 · 기억에서 읽음)", TIDE_DAYS);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            log.warn("[TIDEFLY-SEA] 미리 받기 실패 - {}", e.toString());
        } finally {
            lastWarmEnd = System.currentTimeMillis();
            firstWarm = false;
            warming.set(false);
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setContentType("application/json; charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        String name = req.getParameter("name");
        String key = com.gh.routefly.web.RouteflyConfig.get("kma.apihub.key");
        long now = System.currentTimeMillis();
        ZonedDateTime nowUtc = ZonedDateTime.now(ZoneOffset.UTC);
        String find = req.getParameter("find");
        if (find != null) {
            String hit = find(find, names());
            JsonObject out = new JsonObject();
            out.addProperty("hit", hit != null);
            if (hit != null) out.addProperty("q", hit);
            resp.getWriter().write(out.toString());
            return;
        }
        if ("1".equals(req.getParameter("spots"))) {
            List<SeaWarning> wrn = cachedWarnings(now);
            JsonObject marks = new JsonObject();
            Gson gson = new Gson();
            for (JsonElement e : spots()) {
                JsonObject s = e.getAsJsonObject();
                JsonObject b = points().get(s.get("base").getAsString());
                if (!s.has("extra") || b == null) continue;
                List<String> ids = regIds(regs(), b.get("name").getAsString());
                List<String> all = new ArrayList<>(ids == null ? List.of() : ids);
                for (JsonElement z : s.getAsJsonArray("extra")) all.add(z.getAsString());
                Verdict v = Verdict.judge(s.get("boat").getAsBoolean(), ids == null ? null : all, wrn, cachedSea(b.get("lzone").getAsInt(), b.get("szone").getAsInt(), nowUtc));
                JsonObject m = new JsonObject();
                m.addProperty("mark", v.mark());
                m.add("reasons", gson.toJsonTree(v.reasons()));
                marks.add(s.get("id").getAsString(), m);
            }
            JsonObject out = new JsonObject();
            out.add("spots", spots());
            out.add("marks", marks);
            resp.getWriter().write(out.toString());
            return;
        }
        if (name == null) {
            // 목록 - 미리 받아 둔 것만(손님을 기다리게 하지 않음)
            List<SeaWarning> wrn = cachedWarnings(now);
            JsonArray items = new JsonArray();
            boolean tideOn = portalKey() != null;
            java.time.LocalDate today = java.time.LocalDate.now(KST);
            boolean missing = key != null && wrn == null;
            for (JsonObject p : sorted(points().values())) {
                SeaForecast sea = cachedSea(p.get("lzone").getAsInt(), p.get("szone").getAsInt(), nowUtc);
                String code = p.get("tide").getAsString();
                Tide t0 = cachedTide(code, today), t1 = cachedTide(code, today.plusDays(1));
                // 2026-11-14 PC: 바다만 보고 물때 빈 칸은 보지 않아 화면이 다시 묻지 않았음 - 물때도 셈
                missing |= (key != null && sea == null) || (tideOn && (t0 == null || t1 == null));
                // 2026-11-15 PC: 오늘 것을 못 받았는데 내일 것만 보내 "다음 만조 내일 …" 로 오늘 물때를 건너뜀 - 오늘이 없으면 보내지 않음(화면은 받는 중)
                items.add(result(p, wrn, sea, t0 == null ? null : Tide.join(t0, t1)));
            }
            // 빈 칸이 있으면 미리 받기를 바로 한 바퀴(도는 중이면 그대로, 끝난 지 1분 안이면 기다림) - 화면은 "받는 중" 으로 보고 곧 다시 물음
            if (missing && !warming.get() && now - lastWarmEnd > 60_000 && timer != null) timer.execute(this::warm);
            JsonObject out = head();
            out.addProperty("warming", missing);
            out.add("items", items);
            resp.getWriter().write(out.toString());
            return;
        }
        JsonObject p = points().get(name.trim());
        if (p == null) {
            resp.setStatus(404);
            resp.getWriter().write("{\"error\":\"없는 포인트\"}");
            return;
        }
        SeaForecast sea = key == null ? null : sea(key, p.get("lzone").getAsInt(), p.get("szone").getAsInt(), nowUtc, now);
        List<SeaWarning> wrn = key == null ? null : warnings(key, now, false);
        String pkey = portalKey();
        java.time.LocalDate today = java.time.LocalDate.now(KST);
        Tide t0 = pkey == null ? null : tide(pkey, p.get("tide").getAsString(), today);
        Tide tide = t0 == null ? null : Tide.join(t0, tide(pkey, p.get("tide").getAsString(), today.plusDays(1)));
        JsonObject out = head();
        for (Map.Entry<String, JsonElement> e : result(p, wrn, sea, tide).entrySet()) out.add(e.getKey(), e.getValue());
        if ("1".equals(req.getParameter("detail"))) {
            Gson gson = new Gson();
            JsonArray days = new JsonArray();
            for (int i = 0; i < DETAIL_DAYS; i++) {
                java.time.LocalDate day = today.plusDays(i);
                Tide t = pkey == null ? null : tide(pkey, p.get("tide").getAsString(), day);
                JsonObject d = dayInfo(p, day);
                if (t != null) {
                    d.add("events", gson.toJsonTree(t.events()));
                    d.addProperty("rangeCm", Tide.range(t.events()));
                }
                days.add(d);
            }
            out.add("days", days);
            if (key != null) {
                String fc = sea != null ? sea.tmFc() : times(nowUtc).get(1)[0];
                out.add("hourly", gson.toJsonTree(hourly(key, p.get("lzone").getAsInt(), p.get("szone").getAsInt(), fc, nowUtc)));
            }
        }
        resp.getWriter().write(out.toString());
    }

    /** 그날 해 · 음력 · 물때 이름(계산, 바깥 호출 없음). 서해 포인트는 서해 셈(Astro.mulddae). */
    private JsonObject dayInfo(JsonObject p, java.time.LocalDate day) {
        int[] sun = Astro.sun(p.get("lat").getAsDouble(), p.get("lon").getAsDouble(), day);
        int ld = Astro.lunarDay(day);
        JsonObject d = new JsonObject();
        d.addProperty("date", day.toString());
        d.addProperty("sunrise", Astro.hm(sun[0]));
        d.addProperty("sunset", Astro.hm(sun[1]));
        d.addProperty("lunarDay", ld);
        d.addProperty("mulddae", Astro.mulddae(ld, west(regIds(regs(), p.get("name").getAsString()))));
        d.addProperty("sari", Astro.sari(ld));
        return d;
    }

    /** 순수 함수 - 화면 묶음 이름: 첫 해상 특보구역이 S11 동해 · S12 서해 · S1323 · S1324 · S133 제주 · 그 밖 S13 남해. 짝이 없으면 "그 밖". */
    static String area(List<String> regIds) {
        if (regIds == null || regIds.isEmpty()) return "그 밖";
        String c = regIds.get(0);
        if (c.startsWith("S11")) return "동해";
        if (c.startsWith("S12")) return "서해";
        if (c.startsWith("S1323") || c.startsWith("S1324") || c.startsWith("S133")) return "제주";
        if (c.startsWith("S13")) return "남해";
        return "그 밖";
    }

    /** 순수 함수 - 서해 포인트인지: 첫 해상 특보구역 코드가 서해(S12…). 짝이 없으면 남해 · 동해 셈. */
    static boolean west(List<String> regIds) {
        return regIds != null && !regIds.isEmpty() && regIds.get(0).startsWith("S12");
    }

    /** 앞으로 72시간 3시간 간격 소해구 예측 - 같은 발표의 발효 시각마다 한 번씩(4개씩 함께), 6시간 기억. 못 받은 시각은 빠짐. */
    private static List<SeaForecast> hourly(String key, int lzone, int szone, String fc, ZonedDateTime nowUtc) {
        List<java.util.concurrent.Future<SeaForecast>> jobs = new ArrayList<>();
        for (String ef : hourlyTimes(fc, nowUtc)) {
            jobs.add(DETAIL_POOL.submit(() -> {
                String id = "seaf:" + lzone + ":" + szone + ":" + fc + ":" + ef;
                Object[] hit = CACHE.get(id);
                if (hit != null && System.currentTimeMillis() - (Long) hit[0] < 6 * 60 * 60_000L) return (SeaForecast) hit[1];
                SeaForecast f = SeaForecast.parse(get(BASE + "typ06/url/marine_small_zone.php?tma_fc=" + fc + "&tma_ef=" + ef
                        + "&Lzone=" + lzone + "&Szone=" + szone + "&disp=0&help=1", key, "SEA"));
                if (f != null) CACHE.put(id, new Object[] {System.currentTimeMillis(), f});
                return f;
            }));
        }
        List<SeaForecast> out = new ArrayList<>();
        for (var j : jobs) {
            try {
                SeaForecast f = j.get(20, TimeUnit.SECONDS);
                if (f != null) out.add(f);
            } catch (Exception e) {
                // 그 시각만 빠짐
            }
        }
        return out;
    }

    /**
     * 순수 함수 - 3시간 예보로 물을 발효 시각들(UTC yyyyMMddHH): 지금과 가장 가까운 3시간 단위부터 72시간 뒤까지, 발표 + 75시간을 넘지 않게.
     */
    static List<String> hourlyTimes(String fc, ZonedDateTime nowUtc) {
        ZonedDateTime issue = java.time.LocalDateTime.parse(fc, HOUR).atZone(ZoneOffset.UTC);
        ZonedDateTime first = java.time.LocalDateTime.parse(times(nowUtc).get(0)[1], HOUR).atZone(ZoneOffset.UTC);
        if (first.isBefore(issue)) first = issue;
        List<String> out = new ArrayList<>();
        for (ZonedDateTime t = first; !t.isAfter(first.plusHours(HOURLY_HOURS)) && !t.isAfter(issue.plusHours(75)); t = t.plusHours(3)) out.add(t.format(HOUR));
        return out;
    }

    /** 응답 머리 - 판단 기준 · 출처. */
    private static JsonObject head() {
        JsonObject out = new JsonObject();
        out.addProperty("basis", Verdict.BASIS);
        out.addProperty("source", "기상청 API허브(해구별 예측 · 기상특보), 국립해양조사원 조석예보 · 바다낚시지수(포인트)");
        return out;
    }

    /** 포인트 하나의 판단 · 자료. */
    private JsonObject result(JsonObject p, List<SeaWarning> wrn, SeaForecast sea, Tide tide) {
        List<String> regIds = regIds(regs(), p.get("name").getAsString());
        Verdict v = Verdict.judge(p.get("boat").getAsBoolean(), regIds, wrn, sea);
        Gson gson = new Gson();
        JsonObject out = new JsonObject();
        out.add("point", p);
        out.addProperty("area", area(regIds));
        out.addProperty("mark", v.mark());
        out.add("reasons", gson.toJsonTree(v.reasons()));
        if (sea != null) out.add("sea", gson.toJsonTree(sea));
        if (tide != null) out.add("tides", gson.toJsonTree(tide));   // point 안의 tide(지점 코드)와 이름이 겹치지 않게(2026-11-14 PC)
        // 오늘: 해 · 음력 · 물때 이름(계산) + 물 세기 %(받아 둔 15일 물때가 다 있을 때만)
        java.time.LocalDate today = java.time.LocalDate.now(KST);
        JsonObject d = dayInfo(p, today);
        List<Double> ranges = new ArrayList<>();
        Double todayRange = null;
        for (int i = 0; i < TIDE_DAYS; i++) {
            Tide t = cachedTide(p.get("tide").getAsString(), today.plusDays(i));
            if (t == null) {
                ranges = null;
                break;
            }
            double r = Tide.range(t.events());
            if (i == 0) todayRange = r;
            ranges.add(r);
        }
        if (ranges != null && todayRange != null) {
            Integer pct = Tide.flowPct(todayRange, ranges);
            if (pct != null) d.addProperty("flowPct", pct);
        }
        out.add("today", d);
        if (wrn != null && regIds != null) {
            JsonArray mine = new JsonArray();
            for (SeaWarning w : wrn) if (regIds.contains(w.regId()) || regIds.contains(w.regUp())) mine.add(gson.toJsonTree(w));
            out.add("warnings", mine);
        }
        return out;
    }

    /** 순수 함수 - 목록 차례: 위도 큰 곳(북쪽)부터. */
    static List<JsonObject> sorted(java.util.Collection<JsonObject> points) {
        List<JsonObject> out = new ArrayList<>(points);
        out.sort((a, b) -> Double.compare(b.get("lat").getAsDouble(), a.get("lat").getAsDouble()));
        return out;
    }

    /** 기억에 있는 소해구 예측(지금 발효 시각 것, 부르지 않음). 없으면 null. */
    private static SeaForecast cachedSea(int lzone, int szone, ZonedDateTime nowUtc) {
        Object[] hit = CACHE.get("sea:" + lzone + ":" + szone + ":" + times(nowUtc).get(0)[1]);
        return hit == null || System.currentTimeMillis() - (Long) hit[0] >= SEA_TTL ? null : (SeaForecast) hit[1];
    }

    /** 소해구 예측 - 가장 최근 발표부터, 받지 못하면 하나 앞 발표로(발표 뒤 언제 올라오는지 아직 모름). */
    private static SeaForecast sea(String key, int lzone, int szone, ZonedDateTime nowUtc, long now) {
        for (String[] t : times(nowUtc)) {
            String id = "sea:" + lzone + ":" + szone + ":" + t[1];
            Object[] hit = CACHE.get(id);
            if (hit != null && now - (Long) hit[0] < SEA_TTL) return (SeaForecast) hit[1];
            SeaForecast f = SeaForecast.parse(get(BASE + "typ06/url/marine_small_zone.php?tma_fc=" + t[0] + "&tma_ef=" + t[1]
                    + "&Lzone=" + lzone + "&Szone=" + szone + "&disp=0&help=1", key, "SEA"));
            if (f != null) {
                CACHE.put(id, new Object[] {now, f});
                return f;
            }
        }
        return null;
    }

    /**
     * 기억에 있는 그날 물때(부르지 않음) - 없으면 파일에서(받아 둔 예측은 바뀌지 않음). 없으면 null.
     * 2026-11-15 PC: F5 로 다시 읽을 때마다 기억이 비어 15일치(약 440번)를 처음부터 받다가 끝나기 전에 또 F5 - 물 세기 % 가 한 번도 안 붙었음.
     */
    private static Tide cachedTide(String code, java.time.LocalDate day) {
        Object[] hit = CACHE.get("tide:" + code + ":" + day);
        if (hit != null && System.currentTimeMillis() - (Long) hit[0] < TIDE_TTL) return (Tide) hit[1];
        Tide t = readTide(cacheDir(), code, day);
        if (t != null) CACHE.put("tide:" + code + ":" + day, new Object[] {System.currentTimeMillis(), t});
        return t;
    }

    /** 공공데이터포털 키 - routefly 물때(TideServlet)와 같이 tide.serviceKey, 없으면 tour.serviceKey(같은 개인 키, 서비스마다 활용신청). */
    static String portalKey() {
        String k = com.gh.routefly.web.RouteflyConfig.get("tide.serviceKey");
        return k != null ? k : com.gh.routefly.web.RouteflyConfig.get("tour.serviceKey");
    }

    /** 물때 파일 폴더: 설정 tidefly.cacheDir → 톰캣 폴더(catalina.base)/routefly-tidefly-cache → 임시 폴더/…, 그 아래 tide. */
    static java.nio.file.Path cacheDir() {
        String dir = com.gh.routefly.web.RouteflyConfig.get("tidefly.cacheDir");
        if (dir == null) {
            String base = System.getProperty("catalina.base");
            dir = (base != null ? base : System.getProperty("java.io.tmpdir")) + java.io.File.separator + "routefly-tidefly-cache";
        }
        return java.nio.file.Path.of(dir, "tide");
    }

    /** 받은 물때를 파일로(지점-날짜.json, 임시 파일에 쓰고 한 번에 옮김). 자료가 빈 날은 남기지 않음. 실패해도 조용히(기억만 씀). */
    static void saveTide(java.nio.file.Path dir, String code, java.time.LocalDate day, Tide t) {
        if (t == null || t.events().isEmpty() || !code.matches("[A-Z]{2}_[0-9]{4}")) return;
        try {
            java.nio.file.Files.createDirectories(dir);
            java.nio.file.Path tmp = java.nio.file.Files.createTempFile(dir, code, ".tmp");
            java.nio.file.Files.writeString(tmp, new Gson().toJson(t), StandardCharsets.UTF_8);
            java.nio.file.Files.move(tmp, dir.resolve(code + "-" + day + ".json"), java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) {
            // 2026-11-15 PC: 다시 뜰 때마다 오늘 · 내일 114건을 새로 물음 - 파일이 안 남는 듯해 첫 실패 한 번은 warn 으로(폴더 권한 등)
            if (SAVE_WARNED.compareAndSet(false, true)) log.warn("[TIDEFLY-TIDE] 물때를 파일로 남기지 못함({}) - {}", dir, e.toString());
            else log.debug("[TIDEFLY-TIDE] 파일로 남기지 못함 - {}", e.toString());
        }
    }

    private static final java.util.concurrent.atomic.AtomicBoolean SAVE_WARNED = new java.util.concurrent.atomic.AtomicBoolean();

    /** 폴더 안 물때 파일 수(없으면 0) - 뜬 뒤 첫 바퀴 로그용. */
    static int tideFiles(java.nio.file.Path dir) {
        if (!java.nio.file.Files.isDirectory(dir)) return 0;
        try (var files = java.nio.file.Files.list(dir)) {
            return (int) files.filter(f -> f.getFileName().toString().endsWith(".json")).count();
        } catch (Exception e) {
            return 0;
        }
    }

    /** 파일의 물때. 없거나 읽지 못하면 null. */
    static Tide readTide(java.nio.file.Path dir, String code, java.time.LocalDate day) {
        if (!code.matches("[A-Z]{2}_[0-9]{4}")) return null;
        java.nio.file.Path f = dir.resolve(code + "-" + day + ".json");
        if (!java.nio.file.Files.isRegularFile(f)) return null;
        try {
            Tide t = new Gson().fromJson(java.nio.file.Files.readString(f, StandardCharsets.UTF_8), Tide.class);
            return t == null || t.events() == null || t.events().isEmpty() ? null : t;
        } catch (Exception e) {
            return null;
        }
    }

    /** 지난 날(어제보다 앞) 물때 파일 지우기. 지운 수. */
    static int dropOldTides(java.nio.file.Path dir, java.time.LocalDate today) {
        int n = 0;
        if (!java.nio.file.Files.isDirectory(dir)) return 0;
        try (var files = java.nio.file.Files.list(dir)) {
            for (java.nio.file.Path f : files.toList()) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("^[A-Z]{2}_[0-9]{4}-(\\d{4}-\\d{2}-\\d{2})\\.json$").matcher(f.getFileName().toString());
                if (m.matches() && java.time.LocalDate.parse(m.group(1)).isBefore(today.minusDays(1)) && java.nio.file.Files.deleteIfExists(f)) n++;
            }
        } catch (Exception e) {
            log.debug("[TIDEFLY-TIDE] 지난 파일 지우기 실패 - {}", e.toString());
        }
        return n;
    }

    /** 그날 물때 - 기억에 있으면 그것, 없으면 받아서. 못 받으면 null. */
    private static Tide tide(String key, String code, java.time.LocalDate day) {
        Tide hit = cachedTide(code, day);
        if (hit != null) return hit;
        // 2026-11-15 PC: 포털이 503 · 시간 초과를 내는 동안 같은 지점을 거듭 물었음 - 실패한 지점 · 날은 5분 쉼
        Object[] failed = CACHE.get("tidefail:" + code + ":" + day);
        if (failed != null && System.currentTimeMillis() - (Long) failed[0] < 5 * 60_000L) return null;
        Tide t = Tide.parse(getPortal(tideUrl(code, day), key));
        if (t != null) {
            CACHE.put("tide:" + code + ":" + day, new Object[] {System.currentTimeMillis(), t});
            saveTide(cacheDir(), code, day, t);
        }
        else CACHE.put("tidefail:" + code + ":" + day, new Object[] {System.currentTimeMillis(), null});
        return t;
    }

    /** 순수 함수 - 조석예보(고, 저조) 주소(키 없이). 칸은 명세(15156018): obsCode · reqDate(yyyyMMdd) · type · numOfRows. */
    static String tideUrl(String code, java.time.LocalDate day) {
        return TIDE_URL + "?type=json&pageNo=1&numOfRows=20&obsCode=" + URLEncoder.encode(code, StandardCharsets.UTF_8)
                + "&reqDate=" + day.format(DateTimeFormatter.BASIC_ISO_DATE);
    }

    /** 기억에 있는 특보(부르지 않음). 20분 넘게 묵었으면 null(판단하지 않게 - 지난 특보로 ○ 를 주지 않으려고). */
    private static List<SeaWarning> cachedWarnings(long now) {
        Object[] hit = CACHE.get("wrn");
        if (hit == null || now - (Long) hit[0] >= 2 * WRN_TTL) return null;
        @SuppressWarnings("unchecked")
        List<SeaWarning> w = (List<SeaWarning>) hit[1];
        return w;
    }

    /** 특보 - 10분 안에 받은 것이 있으면 그것(force 면 늘 새로). */
    private static List<SeaWarning> warnings(String key, long now, boolean force) {
        Object[] hit = CACHE.get("wrn");
        if (!force && hit != null && now - (Long) hit[0] < WRN_TTL) {
            @SuppressWarnings("unchecked")
            List<SeaWarning> w = (List<SeaWarning>) hit[1];
            return w;
        }
        List<SeaWarning> w = SeaWarning.parse(get(BASE + "typ01/url/wrn_now_data.php?fe=f&tm=&disp=0&help=1", key, "WRN"));
        if (w != null) CACHE.put("wrn", new Object[] {now, w});
        return w;
    }

    /**
     * 순수 함수 - 물어볼 [발표 tma_fc, 발효 tma_ef](UTC yyyyMMddHH) 두 벌: 지금 앞 가장 가까운 00 · 12시 발표와 그 하나 앞 발표.
     * 발효는 지금과 가장 가까운 3시간 단위(예측은 발표부터 3시간 간격 - 2026-11-14 자료 조사).
     */
    static List<String[]> times(ZonedDateTime nowUtc) {
        ZonedDateTime n = nowUtc.withZoneSameInstant(ZoneOffset.UTC);
        ZonedDateTime issue = n.withHour(n.getHour() < 12 ? 0 : 12).withMinute(0).withSecond(0).withNano(0);
        ZonedDateTime ef = n.withMinute(0).withSecond(0).withNano(0);
        int h = ef.getHour() % 3;
        ef = h == 0 ? ef : (h == 1 && n.getMinute() < 30 ? ef.minusHours(1) : ef.plusHours(3 - h));
        List<String[]> out = new ArrayList<>();
        out.add(new String[] {issue.format(HOUR), ef.format(HOUR)});
        out.add(new String[] {issue.minusHours(12).format(HOUR), ef.format(HOUR)});
        return out;
    }

    /** 순수 함수 - 특보구역 짝. 짝이 없거나 비었으면 null. */
    static List<String> regIds(JsonObject regs, String name) {
        if (regs == null || !regs.has(name) || !regs.get(name).isJsonArray()) return null;
        List<String> out = new ArrayList<>();
        for (JsonElement e : regs.getAsJsonArray(name)) out.add(e.getAsString());
        return out.isEmpty() ? null : out;
    }

    /** 공공데이터포털 GET - 키는 serviceKey(Decoding 키를 인코딩). 200 이 아니면 null, 로그에 주소(키)는 적지 않음. */
    private static String getPortal(String url, String key) {
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(url + "&serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)))
                    .timeout(Duration.ofSeconds(8)).GET().build();
            HttpResponse<String> res = HTTP.send(r, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() == 200) return res.body();
            log.warn("[TIDEFLY-TIDE] HTTP {}", res.statusCode());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("[TIDEFLY-TIDE] 호출 실패 - {}", e.getClass().getSimpleName());
        }
        return null;
    }

    private static String get(String url, String key, String tag) {
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(url + "&authKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)))
                    .timeout(Duration.ofSeconds(8)).GET().build();
            HttpResponse<byte[]> res = HTTP.send(r, HttpResponse.BodyHandlers.ofByteArray());
            String body = KmaText.text(res.body(), res.headers().firstValue("Content-Type").orElse(""));
            if (res.statusCode() == 200) return body;
            log.warn("[{}] HTTP {}", tag, res.statusCode());   // 주소에 키가 있어 주소는 적지 않음
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("[{}] 호출 실패 - {}", tag, e.getClass().getSimpleName());
        }
        return null;
    }

    private Map<String, JsonObject> points() {
        if (points == null) {
            Map<String, JsonObject> m = new ConcurrentHashMap<>();
            JsonElement root = readData("/data/tidefly-points.json");
            if (root != null && root.isJsonArray()) for (JsonElement e : root.getAsJsonArray()) m.put(e.getAsJsonObject().get("name").getAsString(), e.getAsJsonObject());
            points = m;
        }
        return points;
    }

    private volatile JsonArray spots;
    private volatile java.util.Set<String> names;

    private JsonArray spots() {
        if (spots == null) {
            JsonElement root = readData("/data/tidefly-spots.json");
            spots = root != null && root.isJsonArray() ? root.getAsJsonArray() : new JsonArray();
        }
        return spots;
    }

    /** 찾기 이름: 포인트 · 자리 이름과 그 괄호 뺀 것, 자리 이름의 " · " 앞(지역) · 뒤(자리) - 모두 {@link #bare} 로. */
    private java.util.Set<String> names() {
        if (names == null) {
            java.util.Set<String> out = new java.util.HashSet<>();
            List<String> all = new ArrayList<>(points().keySet());
            for (JsonElement e : spots()) all.add(e.getAsJsonObject().get("name").getAsString());
            for (String n : all) {
                out.add(bare(n));
                for (String part : n.replaceAll("\\s*\\(.*?\\)", "").split(" · ")) if (bare(part).length() >= 2) out.add(bare(part));
            }
            names = out;
        }
        return names;
    }

    /** 순수 함수 - 찾기 말을 견줄 꼴로: 괄호 안 · 빈칸 · 문장 부호를 뺌("신암항(부산)" → "신암항", "가의도 · 남측" → "가의도남측"). js/tidefly.js 의 bare 와 같은 셈(둘 다 고침). */
    static String bare(String s) {
        return s == null ? "" : s.replaceAll("\\(.*?\\)", "").replaceAll("[^0-9A-Za-z가-힣]", "");
    }

    /**
     * 순수 함수 - 찾기 말이 낚시 포인트 · 자리 이름이면 맞은 이름(bare 꼴 - 화면 tidefly.js 의 bare 와 같은 셈으로 찾음), 아니면 null(2026-11-15 홍TV님 "찾기에도 찾아질 수 있도록").
     * 이름과 똑같거나, 뒤에 "항" 을 붙이면 같거나("방포" → 방포항), 끝의 "낚시" · "포인트" · "갯바위" · "방파제" 를 떼면 같을 때만 - 산 · 코스 찾기를 가로채지 않게 들어 있기(포함)로는 보지 않음.
     */
    static String find(String q, java.util.Set<String> names) {
        String k = bare(q);
        for (int i = 0; i < 2; i++) {
            if (k.length() < 2) return null;
            if (names.contains(k)) return k;
            if (names.contains(k + "항")) return k + "항";
            k = k.replaceAll("(낚시터|낚시|포인트|갯바위|방파제)+$", "");
        }
        return null;
    }

    private JsonObject regs() {
        if (regs == null) {
            JsonElement root = readData("/data/tidefly-point-wrn.json");
            regs = root != null && root.isJsonObject() ? root.getAsJsonObject() : new JsonObject();
        }
        return regs;
    }

    private JsonElement readData(String path) {
        try (InputStream in = getServletContext().getResourceAsStream(path)) {
            if (in == null) return null;
            return JsonParser.parseString(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("[TIDEFLY-SEA] {} 를 읽지 못함 - {}", path, e.getMessage());
            return null;
        }
    }
}
