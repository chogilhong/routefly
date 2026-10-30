package com.gh.routefly.web;

import java.io.IOException;
import java.util.function.UnaryOperator;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 제휴 · 후원 링크. {@code GET /api/partners} - 설정에 넣은 링크만 내려 줍니다(비어 있으면 화면에 안 보임). 2026-10-15 홍TV님.
 *
 * <ul>
 *   <li>{@code partner.coupang.<물건>} - 쿠팡 파트너스 링크(link.coupang.com · coupa.ng). 물건은 {@link #GEAR}.
 *       한 물건에 여러 개면 쉼표로(앞의 COUPANG_MAX 개까지) → 응답은 물건마다 주소 배열.
 *       "이름|주소" 로 적으면 coupangNames 에 같은 차례로 이름(10자까지) - 산행을 마친 화면의 회복 용품 단추(2026-10-28).
 *       화면은 링크 아래에 공정위가 정한 "수수료를 받습니다" 문구를 붙입니다.</li>
 *   <li>{@code partner.agoda.url} - 아고다 제휴 링크(www.agoda.com). 안에 {lat} · {lon} 이 있으면 들머리 좌표로 바꿉니다.</li>
 *   <li>{@code partner.trip.url} - 트립닷컴 제휴 링크(www · kr · us.trip.com, 2026-10-21 신청 중). {lat} · {lon} 도 아고다처럼.</li>
 *   <li>{@code donate.url} - 후원(toss.me · qr.kakaopay.com 등 https 주소).</li>
 *   <li>{@code partner.hotels.url} - 호텔스컴바인 제휴 링크(2026-10-29 홍TV님 "나중에 연결될 것을 대비", 여기어때 · 야놀자는 2026-10-30 뺌).
 *       안에 {q}(찾는 장소 이름) · {lat} · {lon} 이 있으면 /m/ "🏨 근처 숙소 찾기" 가 바꿔 넣고, 없으면 링크 그대로(그 사이트 검색 화면). 비어 있으면 첫 화면 🔎(제휴 아님).</li>
 *   <li>{@code donate.en.url} - 외국 사람용 후원(PayPal 결제 링크 · paypal.me · ko-fi.com) - 영어 페이지(/en/m/)에만. 2026-10-17 홍TV님.</li>
 *   <li>{@code biz.name} · {@code biz.address} · {@code biz.phone} - 위치기반서비스 이용약관(lbs-terms.html)에 적는 상호 · 주소 · 전화(위치정보법 12조, 2026-10-26).
 *       개인 · 사업자 정보라 저장소에 적지 않고 설정에만 둡니다. 비어 있으면 화면에 "준비 중".</li>
 * </ul>
 * 가입 · 링크 만들기는 홍TV님이 하고, 링크는 설정에만 둡니다. 주소는 정해진 곳(https)만 받습니다 - 설정이 잘못돼도 엉뚱한 곳으로 보내지 않게.
 */
@WebServlet(urlPatterns = {"/api/partners"})
public class PartnersServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    /** 한 물건에 보일 쿠팡 링크 수. */
    static final int COUPANG_MAX = 3;
    /** 쿠팡 링크를 붙일 수 있는 물건(설정 열쇠 partner.coupang.&lt;이것&gt;) - course-kit.js gearList 의 key 와 같음. */
    static final String[] GEAR = {"water", "rain", "headlamp", "battery", "firstaid", "shoes", "pack", "stick", "knee", "sun", "warm", "crampon", "glove", "recovery"};   // recovery - 산행 뒤 회복 용품(폼롤러 · 마사지건 · 파스 등, 2026-10-28 홍TV님 - 산행을 마친 화면)

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.ok(req, resp, body(RouteflyConfig::get));
    }

    /** 순수 함수 - 응답 본문. conf 는 설정 읽기(열쇠 → 값, 없으면 null). */
    static JsonObject body(UnaryOperator<String> conf) {
        JsonObject out = new JsonObject(), coupang = new JsonObject(), names = new JsonObject();
        out.addProperty("success", true);
        for (String g : GEAR) {
            String v = conf.apply("partner.coupang." + g);
            if (v == null) continue;
            JsonArray urls = new JsonArray(), nm = new JsonArray();
            for (String u : v.split(",")) {
                u = u.trim();
                // "이름|주소" 도 받음(2026-10-28 홍TV님 "폼롤러 · 마사지건 · 콘드로이친" - 회복 용품을 이름별 단추로)
                String label = null;
                int bar = u.indexOf('|');
                if (bar > 0) { label = Party.clean(u.substring(0, bar), 10); u = u.substring(bar + 1).trim(); }
                if (urls.size() < COUPANG_MAX && allowed(u, "https://link.coupang.com/", "https://coupa.ng/")) { urls.add(u); nm.add(label == null ? "" : label); }
            }
            if (urls.size() > 0) coupang.add(g, urls);
            boolean any = false;
            for (int i = 0; i < nm.size(); i++) any |= !nm.get(i).getAsString().isEmpty();
            if (any) names.add(g, nm);   // 주소와 같은 차례, 이름 없는 것은 ""
        }
        out.add("coupang", coupang);
        out.add("coupangNames", names);
        String agoda = conf.apply("partner.agoda.url");
        if (checkHost("partner.agoda.url", agoda, "agoda.com")) out.addProperty("agoda", agoda);
        String trip = conf.apply("partner.trip.url");
        if (checkHost("partner.trip.url", trip, "trip.com")) out.addProperty("trip", trip);
        // 나중에 제휴할 숙소 사이트(2026-10-29) - 그 사이트 주소이고 {q} · {lat} 가 든 링크만
        String[][] more = {{"hotels", "hotelscombined.co.kr"}};   // 여기어때 · 야놀자는 뺌(2026-10-30 홍TV님)
        for (String[] m : more) {
            String u = conf.apply("partner." + m[0] + ".url");
            if (u != null && checkHost("partner." + m[0] + ".url", u, m[1])) out.addProperty(m[0], u);   // {q} · {lat} 가 없으면 그 사이트 검색 화면으로(제휴 꼬리만)
        }
        String donate = conf.apply("donate.url");
        if (allowed(donate, "https://")) out.addProperty("donate", donate);
        String donateEn = conf.apply("donate.en.url");
        if (allowed(donateEn, "https://www.paypal.com/", "https://paypal.me/", "https://www.paypal.me/", "https://ko-fi.com/")) out.addProperty("donateEn", donateEn);
        JsonObject biz = new JsonObject();
        for (String k : new String[] {"name", "address", "phone"}) {
            String v = Party.clean(conf.apply("biz." + k), 120);   // 꺾쇠 · 따옴표 뺌
            if (v != null) biz.addProperty(k, v);
        }
        out.add("biz", biz);
        return out;
    }

    /** 순수 함수 - 그 앞부분으로 시작하는 https 주소이고 따옴표 · 꺾쇠 · 빈칸이 없으면 true. */
    /** 제휴 링크 최대 길이 - 트립닷컴 검색 결과 주소 + 제휴 꼬리는 500자를 넘음(2026-10-28 kr.trip.com 링크가 걸러져 단추가 사라짐). */
    static final int MAX_URL = 2000;

    static boolean allowed(String url, String... prefixes) {
        return why(url, prefixes) == null;
    }

    /** 왜 받지 않는지(받으면 null) - 값은 로그에 남기지 않고 까닭 · 길이만. */
    static String why(String url, String... prefixes) {
        if (url == null) return "없음";
        if (url.length() > MAX_URL) return "길이 " + url.length() + "자(" + MAX_URL + "자까지)";
        if (url.matches(".*[\\s\"'<>\\\\].*")) return "빈칸 · 따옴표 · 꺾쇠 · 역슬래시가 들어 있음(줄 끝 빈칸도)";
        for (String p : prefixes) if (url.startsWith(p) && url.length() > p.length()) return null;
        return "주소 시작이 " + String.join(" · ", prefixes) + " 가 아님";
    }

    /**
     * 주소 이름(host)으로 - https 이고 이름이 domain 이거나 그 아래(kr.trip.com · www.trip.com · trip.com).
     * 2026-10-28: 트립닷컴 링크가 "https://kr.trip.com?…" 처럼 / 없이 ? 로 이어져 앞글자 비교에 걸렸음.
     */
    static String whyHost(String url, String domain) {
        if (url == null) return "없음";
        if (url.length() > MAX_URL) return "길이 " + url.length() + "자(" + MAX_URL + "자까지)";
        if (url.matches(".*[\\s\"'<>\\\\].*")) return "빈칸 · 따옴표 · 꺾쇠 · 역슬래시가 들어 있음(줄 끝 빈칸도)";
        // URI 로 풀지 않음 - 링크 안의 {lat} · {lon} · | 같은 글자 때문에 풀리지 않을 수 있음. 앞부분 "https://이름" 만 봄
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(?i:https)://([^/?#:@]+)(?::\\d+)?(?:[/?#].*)?$").matcher(url);
        if (!m.matches()) return url.regionMatches(true, 0, "https://", 0, 8) ? "주소 이름 모양이 아님(@ 등)" : "https 가 아님";
        String host = m.group(1).toLowerCase(java.util.Locale.ROOT);
        if (!host.equals(domain) && !host.endsWith("." + domain)) return "주소 이름이 " + domain + " 가 아님(" + host + ")";
        return null;
    }

    /** 설정이 있는데 받지 않으면 까닭을 한 번만 로그에(2026-10-28 - 왜 단추가 없는지 서버 로그로 알 수 있게, 값은 안 남김). */
    static boolean checkHost(String key, String url, String domain) {
        String w = whyHost(url, domain);
        if (w == null) return true;
        if (url != null && warned.add(key + ":" + w))
            org.apache.logging.log4j.LogManager.getLogger(PartnersServlet.class).warn("설정 {} 를 받지 않음: {}", key, w);
        return false;
    }

    private static final java.util.Set<String> warned = java.util.concurrent.ConcurrentHashMap.newKeySet();

}
