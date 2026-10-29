package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonObject;

/**
 * 🏨 근처 숙소 제휴 링크 - 서버에서 그림(코스 소개 페이지 /c/ 는 스크립트가 없음, 2026-10-29 홍TV님 "작업해").
 * course-kit.js tripLink · afterHikeLinks 의 숙소 고르기와 같은 규칙(트립닷컴 먼저, 없으면 {lat} · {lon} 이 든 아고다). 주소는 PartnersServlet 이 검사한 것만.
 */
final class Stays {

    private Stays() {
    }

    private static final Pattern TRIP = Pattern.compile("^https://((?:[a-z0-9-]+\\.)*trip\\.com)(?=[/?#]|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DROP = Pattern.compile("^(cityId|city|cityName|provinceId|countryId|districtId|optionId|destName|searchType|searchWord|searchValue|searchCoordinate|lat|lon|checkIn|checkOut|checkin|checkout|listFilters)$", Pattern.CASE_INSENSITIVE);

    /** 순수 함수 - course-kit.js tripLink 와 같음: 제휴 꼬리는 두고 검색 위치만 좌표로. 트립닷컴이 아니면 null. */
    static String tripLink(String base, double lat, double lon, String name) {
        if (base == null) return null;
        Matcher m = TRIP.matcher(base);
        if (!m.find() || !Double.isFinite(lat) || !Double.isFinite(lon)) return null;
        int qi = base.indexOf('?');
        String q = qi < 0 ? "" : base.substring(qi + 1).split("#", -1)[0];
        List<String> keep = new ArrayList<>();
        for (String kv : q.split("&")) {
            String k = kv.split("=", -1)[0];
            if (!k.isEmpty() && !DROP.matcher(k).matches()) keep.add(kv);
        }
        String nm = (name == null ? "" : name).replaceAll("[|*&#?=]", " ").replaceAll("\\s+", " ").trim();
        if (nm.codePointCount(0, nm.length()) > 30) nm = nm.substring(0, nm.offsetByCodePoints(0, 30));
        if (nm.isEmpty()) nm = "들머리";
        String la = String.format(Locale.ROOT, "%.6f", lat), lo = String.format(Locale.ROOT, "%.6f", lon);
        List<String> parts = new ArrayList<>(List.of("cityId=0", "searchType=LM", "searchWord=" + enc(nm),
                "searchValue=" + enc("13|0*13*" + la + "|" + lo + "|" + nm + "|0|1"), "listFilters=17~5*17*5"));
        parts.addAll(keep);
        return "https://" + m.group(1).toLowerCase(Locale.ROOT) + "/hotels/list?" + String.join("&", parts);
    }

    /** encodeURIComponent 와 같게(빈칸 %20, ~ ' ( ) ! * 는 그대로). */
    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20").replace("%7E", "~").replace("%27", "'")
                .replace("%28", "(").replace("%29", ")").replace("%21", "!").replace("%2A", "*");
    }

    /** 순수 함수 - [글, 주소] 또는 null(설정 없음). p = PartnersServlet.body 결과. */
    static String[] pick(JsonObject p, double lat, double lon, String name) {
        if (p == null) return null;
        String trip = p.has("trip") ? tripLink(p.get("trip").getAsString(), lat, lon, name) : null;
        if (trip != null) return new String[] {"🏨 근처 숙소(트립닷컴)", trip};
        if (p.has("agoda") && p.get("agoda").getAsString().contains("{lat}") && Double.isFinite(lat) && Double.isFinite(lon))
            return new String[] {"🏨 근처 숙소(아고다)", p.get("agoda").getAsString().replace("{lat}", String.format(Locale.ROOT, "%.5f", lat)).replace("{lon}", String.format(Locale.ROOT, "%.5f", lon))};
        return null;
    }

    /** 순수 함수 - 코스 페이지의 숙소 줄 HTML(산 페이지 .stays 와 같은 모양). 없으면 "". */
    static String html(JsonObject p, double lat, double lon, String name) {
        String[] it = pick(p, lat, lon, name);
        if (it == null) return "";
        return "<p class=\"stays\"><a href=\"" + ShareServlet.esc(it[1]) + "\" target=\"_blank\" rel=\"noopener sponsored\">" + it[0] + " ›</a>"
                + "<small> 제휴 링크 - 예약하면 routefly 가 수수료를 받습니다(값은 같음).</small></p>";
    }
}
