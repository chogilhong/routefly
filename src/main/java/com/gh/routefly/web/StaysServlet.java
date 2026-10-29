package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 들머리 근처 숙박 · 식당. {@code GET /api/stays?lat=35.79&lon=128.12[&kind=food][&pet=1]} (pet=1 - 반려동물 동반 가능한 곳만, KorPetTourService2) - 한국관광공사 TourAPI 위치기반 관광정보
 * (숙박 contentTypeId 32, kind=food 면 음식점 39), 반경 5km. 2026-10-14 홍TV님: 들머리 쪽 펜션 · 모텔 · 호텔(먼저 가야산), 그다음 근처 식당 · 5km.
 *
 * <ul>
 *   <li>좌표는 코스 출발점(들머리)입니다 - 화면이 내 위치를 보내지 않습니다. 소수 셋째 자리(약 100m)로 묶어 하루 동안 담아 둡니다(호출 수 줄이기).</li>
 *   <li>인증키 {@code tour.serviceKey}(공공데이터포털 일반 인증키 Decoding)는 서버에만 둡니다. 없거나 TourAPI 가 실패하면
 *       {@code {success:true, stays:[], unavailable:true}} - 오류 내용은 로그에만.</li>
 *   <li>주소 {@code tour.url} 은 바꿀 수 있습니다(기본 KorService2 locationBasedList2).</li>
 * </ul>
 * → {@code {success, stays:[{name, id, addr, tel, lat, lon, dist_m}], source:"한국관광공사"}} - id 는 TourAPI contentid
 */
@WebServlet(urlPatterns = {"/api/stays"})
public class StaysServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://apis.data.go.kr/B551011/KorService2/locationBasedList2";
    /** pet=1 - 반려동물 동반여행 서비스의 위치 검색(나오는 곳이 모두 반려동물 동반 가능한 곳, 2026-10-14 홍TV님). */
    static final String PET_URL = "https://apis.data.go.kr/B551011/KorPetTourService2/locationBasedList2";
    static final int RADIUS_M = 5000, PET_WIDE_M = 20000, ROWS = 20, CACHE_MAX = 500;
    static final long CACHE_MS = 24L * 60 * 60 * 1000;

    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(CACHE_MAX, CACHE_MS);
    /** 기억에 없어 바깥에 새로 묻는 횟수 상한 - 주소마다 한 시간 40번, 하루 3,000번(설정 quota.stays.ip · .day, 2026-10-30). */
    private static final OutQuota QUOTA = OutQuota.of("stays", 40, 3000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        boolean pet = "1".equals(req.getParameter("pet"));
        String type = typeOf(req.getParameter("kind"));   // pet=1 도 32 · 39 - 활용매뉴얼 v4.1 은 80 · 82 라지만 실제로는 80 · 82 에 0곳, 32 · 39 에 북한산 12 · 4곳(2026-10-14 PetTourProbe 로 확인 - 응답의 contenttypeid 도 국문 번호)
        String key = (pet ? "pet" : "") + type + "@" + cacheKey(at[0], at[1]);
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            out = QUOTA.allow(ip, now) ? fetch(at[0], at[1], type, pet) : unavailable();
            if (!out.has("unavailable")) CACHE.put(key, out, now);
        }
        Json.ok(req, resp, out);
    }

    private static JsonObject fetch(double lat, double lon, String type, boolean pet) {
        String serviceKey = RouteflyConfig.get("tour.serviceKey");
        // 숙박은 카카오 "숙박" 분류(AD5)도 - 관광공사에 없는 호텔 · 리조트까지(2026-10-29 홍TV님: 구글처럼 소공원 앞 켄싱턴 등이 나오게)
        String kakao = !pet && "32".equals(type) ? RouteflyConfig.get("kakao.restKey") : null;
        if (serviceKey == null && kakao == null) return unavailable();
        String base = RouteflyConfig.get(pet ? "tour.petListUrl" : "tour.url");
        if (base == null) base = pet ? PET_URL : DEFAULT_URL;
        // 카카오는 20km 로 한 번만 묻고(가까운 순 15곳) 반경마다 거리로 자름 - 넓혀 볼 때 다시 묻지 않음(2026-10-30 호출 줄이기)
        JsonArray kAll = kakao == null ? null : kakaoFetch(kakao, lat, lon);
        JsonObject out = gather(base, serviceKey, kAll, lat, lon, type, RADIUS_M, pet);
        // 반려동물 동반 가능한 곳은 드묾 - 5km 안에 없으면 20km 까지 넓혀 한 번 더(2026-10-14 PC: 가야산 · 북한산 5km 안 0곳)
        // 숙박도 5km 안에 없으면 20km 까지(2026-10-29 홍TV님 - PC: 설악산 소공원 5km 안 0곳, 관광공사에 설악동 숙소가 없고 속초 시내가 7~8km)
        int wideM = wideRadius(pet, type);
        if (wideM > 0 && out != null && out.getAsJsonArray("stays").size() == 0) {
            JsonObject wide = gather(base, serviceKey, kAll, lat, lon, type, wideM, pet);
            if (wide != null) out = wide;
        }
        return out != null ? out : unavailable();
    }

    static final String KAKAO_URL = "https://dapi.kakao.com/v2/local/search/category.json";

    /** 카카오 숙박 분류 20km 한 번. 못 받으면 null. */
    private static JsonArray kakaoFetch(String kakao, double lat, double lon) {
        String t = OpenApi.get(kakaoUrl(lat, lon, PET_WIDE_M), "STAYS-KAKAO", java.time.Duration.ofSeconds(8), "Authorization", "KakaoAK " + kakao);
        JsonArray kk = t == null ? null : kakaoStays(t);
        if (kk == null && t != null) OpenApi.warn("STAYS-KAKAO", t);
        return kk;
    }

    /** 관광공사 + (숙박이면) 카카오(kAll 을 반경으로 자름). 둘 다 못 받으면 null. */
    private static JsonObject gather(String base, String serviceKey, JsonArray kAll, double lat, double lon, String type, int radius, boolean pet) {
        JsonObject tour = serviceKey == null ? null : fetch(base, serviceKey, lat, lon, type, radius, pet);
        if (kAll == null) return tour;
        JsonObject out = merge(within(kAll, radius), tour == null ? new JsonArray() : tour.getAsJsonArray("stays"));
        out.addProperty("radius_km", radius / 1000);
        return out;
    }

    /** 순수 함수 - 카카오 숙박 분류 검색 주소(가까운 순 15곳 - 한 쪽 최대). */
    static String kakaoUrl(double lat, double lon, int radius) {
        return KAKAO_URL + String.format(Locale.ROOT, "?category_group_code=AD5&x=%.6f&y=%.6f&radius=%d&sort=distance&size=15", lon, lat, Math.min(radius, 20000));
    }

    /** 순수 함수 - 카카오 답 → 숙소들 [{name, kind, addr, tel, lat, lon, dist_m, url}]. 꼴이 틀리면 null. */
    static JsonArray kakaoStays(String text) {
        try {
            JsonArray docs = JsonParser.parseString(text).getAsJsonObject().getAsJsonArray("documents"), out = new JsonArray();
            for (JsonElement e : docs) {
                JsonObject d = e.getAsJsonObject(), s = new JsonObject();
                Double y = num(d, "y"), x = num(d, "x");
                String name = str(d, "place_name");
                if (name == null || y == null || x == null || parse(String.valueOf(y), String.valueOf(x)) == null) continue;
                s.addProperty("name", Party.clean(name, 60));
                String cat = str(d, "category_name");   // "여행 > 숙박 > 호텔" → 호텔
                if (cat != null && cat.contains(">")) s.addProperty("kind", Party.clean(cat.substring(cat.lastIndexOf('>') + 1).trim(), 20));
                String addr = str(d, "road_address_name");
                if (addr == null) addr = str(d, "address_name");
                if (addr != null) s.addProperty("addr", Party.clean(addr, 80));
                String tel = str(d, "phone");
                if (tel != null && tel.matches("[0-9+()\\- ]{4,20}")) s.addProperty("tel", tel);
                s.addProperty("lat", y);
                s.addProperty("lon", x);
                Double dist = num(d, "distance");
                if (dist != null) s.addProperty("dist_m", Math.round(dist));
                String url = str(d, "place_url");   // 카카오맵 장소 화면(사진 · 후기)
                if (url != null && url.matches("https?://place\\.map\\.kakao\\.com/\\d{1,15}")) s.addProperty("url", url.replaceFirst("^http:", "https:"));
                out.add(s);
            }
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 순수 함수 - 반경(m) 안의 것만(거리를 모르면 뺌). 원래 배열은 그대로 - 사진 붙이기는 복사본에. */
    static JsonArray within(JsonArray stays, int radius) {
        JsonArray out = new JsonArray();
        for (JsonElement e : stays) {
            JsonObject o = e.getAsJsonObject();
            if (o.has("dist_m") && o.get("dist_m").getAsLong() <= radius) out.add(o.deepCopy());
        }
        return out;
    }

    /** 순수 함수 - 이름 맞추기용(괄호 안 · 빈칸 · 기호 빼고 소문자). */
    static String nameKey(String n) {
        return n == null ? "" : n.replaceAll("\\([^)]*\\)", "").replaceAll("[^\\p{L}\\p{N}]", "").toLowerCase(Locale.ROOT);
    }

    /**
     * 순수 함수 - 카카오 숙소 + 관광공사 숙소 → 하나로. 이름이 같거나(앞이 같아도) 300m 안이면 같은 곳으로 보고 관광공사의 사진 · contentid 를 카카오 쪽에 붙임,
     * 맞는 짝이 없는 관광공사 숙소는 뒤에 더함. 가까운 순 20곳.
     */
    static JsonObject merge(JsonArray kakao, JsonArray tour) {
        java.util.List<JsonObject> all = new java.util.ArrayList<>();
        boolean[] used = new boolean[tour.size()];
        for (JsonElement e : kakao) {
            JsonObject k = e.getAsJsonObject();
            String kn = nameKey(str(k, "name"));
            for (int i = 0; i < tour.size(); i++) {
                if (used[i]) continue;
                JsonObject t = tour.get(i).getAsJsonObject();
                String tn = nameKey(str(t, "name"));
                boolean same = kn.length() >= 2 && tn.length() >= 2 && (kn.startsWith(tn) || tn.startsWith(kn));
                if (!same || MountainServlet.distM(k.get("lat").getAsDouble(), k.get("lon").getAsDouble(), t.get("lat").getAsDouble(), t.get("lon").getAsDouble()) > 300) continue;
                used[i] = true;
                for (String f : new String[] {"photo", "id", "tel"}) if (t.has(f) && !k.has(f)) k.add(f, t.get(f));
                break;
            }
            all.add(k);
        }
        for (int i = 0; i < tour.size(); i++) if (!used[i]) all.add(tour.get(i).getAsJsonObject());
        all.sort(java.util.Comparator.comparingLong(o -> o.has("dist_m") ? o.get("dist_m").getAsLong() : Long.MAX_VALUE));
        JsonArray stays = new JsonArray();
        for (JsonObject o : all) if (stays.size() < ROWS) stays.add(o);
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("stays", stays);
        out.addProperty("source", "카카오 · 한국관광공사");
        return out;
    }

    private static JsonObject fetch(String base, String serviceKey, double lat, double lon, String type, int radius, boolean pet) {
        String text = OpenApi.get(url(base, serviceKey, lat, lon, type, radius), pet ? "STAYS-PET" : "STAYS");
        JsonObject out = text == null ? null : body(text);
        if (out == null && text != null) OpenApi.warn(pet ? "STAYS-PET" : "STAYS", text);
        if (out != null) out.addProperty("radius_km", radius / 1000);
        return out;
    }

    private static JsonObject unavailable() {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("stays", new JsonArray());
        out.addProperty("unavailable", true);
        return out;
    }

    /** 순수 함수 - 우리나라 안 좌표면 [lat, lon], 아니면 null. */
    static double[] parse(String lat, String lon) {
        try {
            double a = Double.parseDouble(lat), o = Double.parseDouble(lon);
            return a >= 33 && a <= 39 && o >= 124 && o <= 132 ? new double[] {a, o} : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 순수 함수 - 담아 두는 열쇠(소수 셋째 자리 - 약 100m). */
    static String cacheKey(double lat, double lon) {
        return String.format(Locale.ROOT, "%.3f,%.3f", lat, lon);
    }

    /** 순수 함수 - 5km 안에 없을 때 넓혀 볼 반경(반려동물 · 숙박 20km, 음식점은 넓히지 않음 0). */
    static int wideRadius(boolean pet, String type) {
        return pet || "32".equals(type) ? PET_WIDE_M : 0;
    }

    /** 순수 함수 - kind → TourAPI 관광타입(food 면 음식점 39, 그 밖은 숙박 32). */
    static String typeOf(String kind) {
        return "food".equals(kind) ? "39" : "32";
    }

    /** 순수 함수 - TourAPI 주소(거리순 arrange=E). */
    static String url(String base, String serviceKey, double lat, double lon, String type) {
        return url(base, serviceKey, lat, lon, type, RADIUS_M);
    }

    static String url(String base, String serviceKey, double lat, double lon, String type, int radius) {
        return base + "?serviceKey=" + URLEncoder.encode(serviceKey, StandardCharsets.UTF_8)
                + "&MobileOS=ETC&MobileApp=routefly&_type=json&arrange=E&contentTypeId=" + type
                + String.format(Locale.ROOT, "&mapX=%.6f&mapY=%.6f&radius=%d&numOfRows=%d&pageNo=1", lon, lat, radius, ROWS);
    }

    /** 순수 함수 - TourAPI JSON → 응답. 모양이 다르면(오류 XML 등) null. item 이 하나면 배열이 아니라 객체로 옴. 빈 결과는 items 가 "". */
    static JsonObject body(String text) {
        JsonObject root;
        try {
            root = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
        } catch (Exception e) {
            return null;
        }
        if (root == null) return null;
        JsonObject header = root.getAsJsonObject("header");
        if (header == null || !"0000".equals(str(header, "resultCode"))) return null;
        JsonArray stays = new JsonArray();
        JsonObject b = root.getAsJsonObject("body");
        JsonElement items = b == null ? null : b.get("items");
        JsonElement list = items != null && items.isJsonObject() ? items.getAsJsonObject().get("item") : null;
        JsonArray arr = list == null ? new JsonArray() : list.isJsonArray() ? list.getAsJsonArray() : one(list);
        for (JsonElement e : arr) {
            if (!e.isJsonObject()) continue;
            JsonObject it = e.getAsJsonObject(), s = new JsonObject();
            String name = OpenApi.plain(str(it, "title"));
            Double y = num(it, "mapy"), x = num(it, "mapx");
            if (name == null || name.isEmpty() || y == null || x == null) continue;
            s.addProperty("name", name);
            String cid = str(it, "contentid");
            if (cid != null && cid.matches("\\d{1,12}")) s.addProperty("id", cid);   // 반려동물 동반 정보(api/pet)를 물을 때
            String addr = OpenApi.plain(str(it, "addr1")), tel = str(it, "tel");
            if (addr != null && !addr.isEmpty()) s.addProperty("addr", addr);
            if (tel != null) s.addProperty("tel", tel);
            String photo = photo(str(it, "firstimage2"), str(it, "firstimage"));
            if (photo != null) s.addProperty("photo", photo);
            s.addProperty("lat", y);
            s.addProperty("lon", x);
            Double d = num(it, "dist");
            if (d != null) s.addProperty("dist_m", Math.round(d));
            stays.add(s);
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("stays", stays);
        out.addProperty("source", "한국관광공사");
        return out;
    }

    /** 순수 함수 - 관광공사 대표 사진(작은 것 먼저). 관광공사 사진 서버(visitkorea.or.kr)만, https 로. */
    static String photo(String... urls) {
        for (String u : urls) {
            if (u == null) continue;
            String h = u.trim().replaceFirst("^http:", "https:");
            if (h.matches("https://[a-z0-9.-]*visitkorea\\.or\\.kr/[\\w./%-]{1,200}")) return h;
        }
        return null;
    }

    private static JsonArray one(JsonElement e) {
        JsonArray a = new JsonArray();
        a.add(e);
        return a;
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        if (e == null || e.isJsonNull()) return null;
        String s = e.getAsString().trim();
        return s.isEmpty() ? null : s;
    }

    private static Double num(JsonObject o, String k) {
        try {
            String s = str(o, k);
            return s == null ? null : Double.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
