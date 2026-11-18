package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

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
 * 드론 공역을 서버가 하루 한 번 새로 받음(2026-11-18 홍TV님 "모두 해 줘" 1 - 임시 비행금지(NOTAM)는 수시로 바뀌는데 data/drone-airspace.json 은 11-17 에 한 번 받은 것).
 * {@code GET /api/airspace} → data/drone-airspace.json 과 같은 꼴(date · src · prh · res · ctr · moa · ua · port · tmp). 아직 새로 받은 것이 없으면 503 - 화면은 그 고정 파일을 씀.
 * <ul>
 *   <li>브이월드 2D 데이터 API(전국 상자, 레이어 다섯) + WFS(항만 · 임시 비행금지) - web.DroneProbe 로 받아 본 주소 · 키(map.vworld.key) · 도메인(HeritageServlet.domain) 그대로.</li>
 *   <li>모두 정상(status OK · features 배열)이고 고정 공역 다섯의 수가 고정 파일의 절반 아래로 줄지 않았을 때만 바꿈(확실하지 않은 값을 굳히지 않음) - 아니면 앞의 것을 그대로.</li>
 *   <li>잘 받은 것은 통계 폴더 옆 airspace.json 에 남겨 재시작 뒤에도 씀. 톰캣이 뜨고 2분 뒤, 그 뒤 24시간마다.</li>
 *   <li>위치를 받지 않음(전국 한 벌, 모든 사용자에게 같음) - 브라우저도 한 시간 담아 둠.</li>
 * </ul>
 * 공역 파일 만드는 셈(build)은 PC 의 web.DroneAirspace(받은 응답 파일 → 고정 파일)도 같이 씀.
 */
@WebServlet(urlPatterns = {"/api/airspace"}, loadOnStartup = 3)
public class AirspaceServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(AirspaceServlet.class);
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final int MAX_BYTES = 16 << 20;
    static final String BOX = "BOX(124.0,33.0,132.0,39.0)", WFS_BBOX = "33.0,124.0,39.0,132.0";

    /** 화면 이름 · 브이월드 레이어 · 남길 칸(차례대로 l 배열) - 2D 데이터 API. */
    static final String[][] KINDS = {
        {"prh", "lt_c_aisprhc", "prh_lbl_1", "prh_lbl_2", "prh_lbl_3", "prh_lbl_4"},
        {"res", "lt_c_aisresc", "res_lbl_1", "res_lbl_2", "res_lbl_3"},
        {"ctr", "lt_c_aisctrc", "ctr_lbl_1"},
        {"moa", "lt_c_aismoac", "moa_lbl_1", "moa_lbl_2", "moa_lbl_3"},
        {"ua", "lt_c_aisuac", "uac_lbl_1", "uac_lbl_2", "uac_lbl_3"}};

    /** WFS 로 받은 것(2026-11-17 홍TV님 "항만시설이랑 임시 비행금지도 넣어줘") - 드론원스톱 지도가 부르는 레이어. temp 의 notam 칸은 기간(B · C)을 화면이 읽음. */
    static final String[][] WFS_KINDS = {
        {"port", "lt_c_aisport", "cont", "ula", "ma", "port_opr", "info_tel", "sup_org", "mgr_tel"},
        {"tmp", "lt_c_aistemp", "prh_lbl_1", "prh_lbl_2", "prh_lbl_3", "notam"}};

    private static volatile String current;   // 마지막으로 잘 받은 공역 글
    private transient ScheduledExecutorService pump;

    @Override
    public void init() {
        try {
            Path f = file();
            if (Files.exists(f)) {
                String s = Files.readString(f, StandardCharsets.UTF_8);
                if (sane(s, baseline())) current = s;
            }
        } catch (Exception e) {
            log.info("[AIRSPACE] 남긴 파일을 읽지 못함 - {}", e.getClass().getSimpleName());
        }
        pump = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "routefly-airspace"); t.setDaemon(true); return t; });
        pump.scheduleWithFixedDelay(this::refresh, 2, 24 * 60, TimeUnit.MINUTES);
    }

    @Override
    public void destroy() {
        if (pump != null) pump.shutdownNow();
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String s = current;
        if (s == null) { Json.fail(resp, HttpServletResponse.SC_SERVICE_UNAVAILABLE, "아직 새로 받은 공역이 없습니다."); return; }
        if (Json.notModified(req, resp, Json.etag(s), "public, max-age=3600")) return;
        Json.send(resp, s);
    }

    /** 브이월드에서 받아 검사하고 바꿈(못 받거나 이상하면 앞의 것 그대로). */
    void refresh() {
        try {
            String key = RouteflyConfig.get("map.vworld.key");
            if (key == null || key.isBlank()) return;
            String auth = "&key=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + "&domain=" + URLEncoder.encode(HeritageServlet.domain(RouteflyConfig.get("site.baseUrl")), StandardCharsets.UTF_8);
            Map<String, String> data = new LinkedHashMap<>(), wfs = new LinkedHashMap<>();
            for (String[] k : KINDS) {
                String t = OpenApi.get(data(k[1], BOX) + auth, "AIRSPACE", Duration.ofSeconds(30), MAX_BYTES);
                if (t == null) { log.info("[AIRSPACE] {} 못 받음 - 앞의 것 그대로", k[1]); return; }
                data.put(k[1], t);
            }
            for (String[] k : WFS_KINDS) {
                String t = OpenApi.get(HeritageServlet.wfs(k[1], WFS_BBOX) + auth, "AIRSPACE", Duration.ofSeconds(30), MAX_BYTES);
                if (t == null) { log.info("[AIRSPACE] {} 못 받음 - 앞의 것 그대로", k[1]); return; }
                wfs.put(k[1], t);
            }
            String s = build(data, wfs, LocalDate.now(KST).toString());
            if (!sane(s, baseline())) { log.info("[AIRSPACE] 받은 공역 수가 고정 파일의 절반 아래 - 앞의 것 그대로"); return; }
            current = s;
            Path f = file();
            Files.createDirectories(f.getParent());
            Path tmp = f.resolveSibling(f.getFileName() + ".tmp");
            Files.writeString(tmp, s, StandardCharsets.UTF_8);
            Files.move(tmp, f, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            log.info("[AIRSPACE] 새로 받음 {}", counts(s));
        } catch (Exception e) {
            log.info("[AIRSPACE] 실패 - {} (앞의 것 그대로)", e.getClass().getSimpleName());   // 키가 든 주소는 남기지 않음
        }
    }

    private static Path file() {
        return Stats.file().resolveSibling("airspace.json");
    }

    /** 고정 파일(data/drone-airspace.json)의 공역 수 - 새로 받은 것이 크게 줄었는지 견줌. 못 읽으면 빈 표(견주지 않음). */
    private Map<String, Integer> baseline() {
        try (java.io.InputStream in = getServletContext().getResourceAsStream("/data/drone-airspace.json")) {
            return in == null ? Map.of() : counts(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** 순수 함수 - 공역 글의 종류마다 수. */
    static Map<String, Integer> counts(String s) {
        Map<String, Integer> m = new LinkedHashMap<>();
        JsonObject o = JsonParser.parseString(s).getAsJsonObject();
        for (String[] k : KINDS) m.put(k[0], o.has(k[0]) ? o.getAsJsonArray(k[0]).size() : 0);
        for (String[] k : WFS_KINDS) m.put(k[0], o.has(k[0]) ? o.getAsJsonArray(k[0]).size() : 0);
        return m;
    }

    /**
     * 순수 함수 - 믿을 만한 공역 글인가: 고정 공역 다섯(prh · res · ctr · moa · ua)과 항만이 비지 않고, 견줄 수(base)가 있으면 그 절반 아래로 줄지 않음.
     * 임시 비행금지(tmp)는 없을 수도 있어 수를 보지 않음.
     */
    static boolean sane(String s, Map<String, Integer> base) {
        try {
            Map<String, Integer> c = counts(s);
            for (String k : new String[] {"prh", "res", "ctr", "moa", "ua", "port"}) {
                int n = c.get(k), b = base.getOrDefault(k, 0);
                if (n == 0 || n * 2 < b) return false;
            }
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** 순수 함수 - 2D 데이터 API 주소(키 · 도메인 빼고). geom - BOX(…) 또는 POINT(경도 위도). web.DroneProbe 도 이것을 씀. */
    static String data(String layer, String geom) {
        return "https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&format=json&errorformat=json&size=1000&page=1&crs=EPSG:4326&geometry=true&attribute=true"
                + "&data=" + layer.toUpperCase(java.util.Locale.ROOT) + "&geomFilter=" + URLEncoder.encode(geom, StandardCharsets.UTF_8);
    }

    /**
     * 순수 함수 - 받은 응답들(레이어 → 글)로 공역 파일 글. data - 2D 데이터 API(status OK 여야 함), wfs - WFS GeoJSON(features 배열). date - 받은 날(화면에 보임).
     * 이름 · 높이 칸과 경계(소수 5자리, 약 1m)만 남김. 꼴이 틀리면 IllegalStateException.
     */
    static String build(Map<String, String> data, Map<String, String> wfs, String date) {
        JsonObject out = new JsonObject();
        out.addProperty("date", date);
        out.addProperty("src", "브이월드 항공 레이어(국토교통부)");
        for (String[] k : KINDS) {
            JsonObject r = JsonParser.parseString(data.get(k[1])).getAsJsonObject().getAsJsonObject("response");
            if (r == null || !"OK".equals(r.get("status").getAsString())) throw new IllegalStateException(k[1] + " 응답이 OK 가 아님");
            JsonArray list = new JsonArray();
            for (JsonElement e : r.getAsJsonObject("result").getAsJsonObject("featureCollection").getAsJsonArray("features")) list.add(zone(e.getAsJsonObject(), k));
            out.add(k[0], list);
        }
        for (String[] k : WFS_KINDS) {
            JsonObject r = JsonParser.parseString(wfs.get(k[1])).getAsJsonObject();
            if (!r.has("features") || !r.get("features").isJsonArray()) throw new IllegalStateException(k[1] + " 응답에 features 가 없음");
            JsonArray list = new JsonArray();
            for (JsonElement e : r.getAsJsonArray("features")) list.add(zone(e.getAsJsonObject(), k));
            out.add(k[0], list);
        }
        return out.toString();
    }

    /** 공역 하나 {l: [칸들], g: 경계}. */
    private static JsonObject zone(JsonObject f, String[] k) {
        JsonObject p = f.getAsJsonObject("properties"), z = new JsonObject();
        JsonArray l = new JsonArray();
        for (int i = 2; i < k.length; i++) l.add(p.has(k[i]) && !p.get(k[i]).isJsonNull() ? p.get(k[i]).getAsString().trim().replaceAll("\\s+", " ") : "");
        z.add("l", l);
        z.add("g", round(f.getAsJsonObject("geometry").getAsJsonArray("coordinates")));
        return z;
    }

    /** 좌표 배열(몇 겹이든)의 숫자를 소수 5자리로. */
    private static JsonElement round(JsonArray a) {
        JsonArray o = new JsonArray();
        for (JsonElement e : a)
            if (e.isJsonArray()) o.add(round(e.getAsJsonArray()));
            else o.add(Math.round(e.getAsDouble() * 1e5) / 1e5);
        return o;
    }
}
