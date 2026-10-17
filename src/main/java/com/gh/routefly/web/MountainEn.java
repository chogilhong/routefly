package com.gh.routefly.web;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * 영어 산 페이지(외국인 등산객 - 2026-10-15 홍TV님). {@code /en/m/} (100대 명산 목록) · {@code /en/m/seoraksan}.
 * MountainServlet 이 /en/m/* 도 받아 여기 순수 함수로 그립니다. 산 · 코스 이름은 {@link Roman} 로마자 + 한글(현지 표지판과 맞춰 보게).
 * 날씨 · 일출 · 일몰은 js/mountain-en.js. 앱 화면(3D · 따라가기)은 한국어 그대로.
 */
final class MountainEn {

    private MountainEn() {
    }

    /** /en/m/ 아래는 두 단계 - 앱 뿌리로 가는 상대 주소. */
    static final String REL = "../..";

    /** 코스 이름에서 영어로 옮길 낱말(긴 것 먼저) - 나머지 한글은 로마자. 땅이름(계곡 · 봉 · 재 …)은 로마자 그대로. */
    private static final String[][] WORDS = {
        {"탐방지원센터", "visitor center"}, {"탐방안내소", "visitor center"}, {"공원지킴터", "ranger post"}, {"매표소", "ticket booth"},
        {"주차장", "parking"}, {"대피소", "shelter"}, {"휴게소", "rest area"}, {"삼거리", "junction"}, {"사거리", "crossroads"},
        {"갈림길", "junction"}, {"탐방로", "trail"}, {"등산로", "trail"}, {"입구", "entrance"}, {"정상", "summit"}, {"코스", "course"},
        {"구간", "section"}, {"순환", "loop"}, {"왕복", "round trip"}, {"분소", "office"}};

    /** 순수 함수 - 코스 이름 영어로: 정해진 낱말은 영어, 나머지는 로마자("오색탐방지원센터 - 대청봉" → "Osaek visitor center - Daecheongbong"). */
    static String courseName(String ko) {
        if (ko == null) return "";
        String s = ko;
        for (String[] w : WORDS) s = s.replace(w[0], " " + w[1] + " ");
        return Roman.of(s).replaceAll("\\s+", " ").replaceAll(" ([)\\],])", "$1").replaceAll("([(\\[]) ", "$1").trim();
    }

    /** 순수 함수 - 정상 이름: 산 이름이 앞에 붙어 있으면 띄움("북한산백운대" → "Bukhansan Baegundae"). */
    static String summitName(String summit, String mountain) {
        if (summit == null) return null;
        if (mountain != null && summit.startsWith(mountain) && summit.length() > mountain.length() && summit.charAt(mountain.length()) != ' ')
            summit = mountain + " " + summit.substring(mountain.length());
        return Roman.of(summit);
    }

    /** 순수 함수 - 산 영어 이름("백운산(광양)" → "Baegunsan (Gwangyang)"). */
    static String name(JsonObject peak) {
        return Roman.of(id(peak)).replace("(", " (");
    }

    static String id(JsonObject peak) {
        return str(peak, "id") != null ? str(peak, "id") : str(peak, "name");
    }

    /** 순수 함수 - 주소 이름으로 산 찾기(로마자 slug, 한글 id 도 받음). 없으면 null. */
    static JsonObject find(JsonArray peaks, String key) {
        String k = key.toLowerCase(Locale.ROOT);
        for (JsonElement e : peaks) {
            JsonObject o = e.getAsJsonObject();
            if (k.equals(Roman.slug(id(o))) || key.equals(id(o))) return o;
        }
        return null;
    }

    /** 순수 함수 - 예상 시간 "2 h 18 min"(MountainServlet.hours 와 같은 어림). */
    static String hours(int distanceM, Integer ascentM) {
        double h = distanceM / 1000.0 / 4 + (ascentM == null ? 0 : ascentM / 600.0);
        long m = Math.round(h * 60);
        return (m >= 60 ? m / 60 + " h " : "") + m % 60 + " min";
    }

    /** 순수 함수 - 영어 문답(있는 자료로만). */
    static List<String[]> faq(JsonObject peak, String name, List<JsonObject> courses, Integer parking) {
        List<String[]> out = new ArrayList<>();
        if (!courses.isEmpty()) {
            JsonObject lo = null, hi = null;
            double loH = Double.MAX_VALUE, hiH = -1;
            for (JsonObject c : courses) {
                double h = c.get("distance_m").getAsInt() / 1000.0 / 4 + (asc(c) == null ? 0 : asc(c) / 600.0);
                if (h < loH) { loH = h; lo = c; }
                if (h > hiH) { hiH = h; hi = c; }
            }
            out.add(new String[] {"How many hiking trails go up " + name + "?", "This page lists " + courses.size() + " trail" + (courses.size() > 1 ? "s" : "")
                    + " to the summit. The shortest is " + courseText(lo) + (courses.size() > 1 ? " and the longest is " + courseText(hi) : "") + "."});
            out.add(new String[] {"How long does it take to hike " + name + "?", "About " + hours(lo.get("distance_m").getAsInt(), asc(lo))
                    + (courses.size() > 1 ? " to " + hours(hi.get("distance_m").getAsInt(), asc(hi)) : "")
                    + " one way to the summit (estimated at 4 km/h plus 1 hour per 600 m of ascent). Add time for the descent."});
        }
        if (MountainServlet.elev(peak) != null)
            out.add(new String[] {"How high is " + name + "?", (MountainServlet.topName(peak) != null ? "The summit, " + summitName(MountainServlet.topName(peak), str(peak, "name")) + "," : name)
                    + " is about " + String.format(Locale.US, "%,d", MountainServlet.elev(peak)) + " m above sea level (" + MountainServlet.elevSource(peak, true) + ")."});
        if (parking != null)
            out.add(new String[] {"Is there parking at " + name + "?", parking > 0 ? "There " + (parking == 1 ? "is 1 parking lot" : "are " + parking + " parking lots")
                    + " within 3 km of the nearest trailhead (Korea national parking data). Check fees and hours on site."
                    : "No registered parking lot within 3 km of the nearest trailhead. Consider public transport."});
        out.add(new String[] {"What is the weather on " + name + "?", "The 'Weather · Air quality · Sunrise' section on this page shows the Korea Meteorological Administration forecast "
                + "for the summit area and today's sunrise and sunset. It is colder and windier at the top."});
        return out;
    }

    private static String courseText(JsonObject c) {
        return courseName(str(c, "name")) + " (" + String.format(Locale.ROOT, "%.1f km", c.get("distance_m").getAsInt() / 1000.0) + ", about "
                + hours(c.get("distance_m").getAsInt(), asc(c)) + ")";
    }

    private static Integer asc(JsonObject c) {
        return c.has("ascent_m") && !c.get("ascent_m").isJsonNull() ? c.get("ascent_m").getAsInt() : null;
    }

    /** 순수 함수 - 영어 산 페이지. */
    static String page(JsonObject peak, List<JsonObject> courses, List<Object[]> nearby, Integer parking, String base) {
        String ko = id(peak), name = name(peak), slug = Roman.slug(ko), summit = str(peak, "summit");
        String url = base + "/en/m/" + slug, koUrl = base + "/m/" + MountainServlet.enc(ko);
        Integer height = MountainServlet.elev(peak);
        String desc = name + " (" + ko + ") hiking trails in Korea: " + courses.size() + " routes with distance, ascent and estimated time, "
                + "weather forecast, air quality, sunrise and sunset. Preview each trail in 3D and follow it on your phone.";
        StringBuilder b = new StringBuilder(head(name + " Hiking Trails, Weather & Sunrise", desc, url, koUrl, base, base + "/og/en/" + slug + ".png"));
        b.append("<main><p class=\"crumb\"><a href=\"").append(REL).append("/en/m/\">‹ 100 Famous Mountains</a></p>");
        b.append("<h1>").append(esc(name)).append(" Hiking Trails <small lang=\"ko\">").append(esc(ko)).append("</small></h1>");
        b.append(MountainServlet.jsonLd(peak, name, url));
        b.append("<p class=\"lead\">One of Korea's 100 Famous Mountains (Korea Forest Service)");
        String topNm = MountainServlet.topName(peak);   // 정상 자리가 꼭대기가 아니면(점봉산 곰배령 등) 높이와 이름을 붙이지 않음
        if (topNm != null) b.append(" · Summit ").append(esc(summitName(topNm, str(peak, "name")))).append(" <span lang=\"ko\">(").append(esc(topNm)).append(")</span>");
        else if (height != null) b.append(" · Elevation");
        if (height != null) b.append(String.format(Locale.US, " %,d m", height));
        b.append("</p>");
        b.append("<section id=\"wx\" data-lat=\"").append(peak.get("lat").getAsDouble()).append("\" data-lon=\"").append(peak.get("lon").getAsDouble())
                .append("\"><h2>Weather · Air quality · Sunrise &amp; Sunset</h2><p class=\"dim\" id=\"wxBody\">Loading…</p></section>");
        b.append("<section><h2>").append(courses.size()).append(courses.size() == 1 ? " trail" : " trails").append("</h2>");
        if (courses.isEmpty()) b.append("<p class=\"dim\">No trail to the summit was found in our data.</p>");
        else {
            b.append("<ul class=\"cs\">");
            for (JsonObject c : courses) {
                String id = str(c, "course_id");
                int dist = c.get("distance_m").getAsInt();
                Integer asc = asc(c);
                Double steep = MountainServlet.steep(c);
                b.append("<li data-id=\"").append(esc(id)).append("\" data-name=\"").append(esc(str(c, "name"))).append("\" data-dist=\"").append(dist).append(asc != null ? "\" data-asc=\"" + asc : "")
                        .append(steep != null ? "\" data-steep=\"" + steep : "").append("\"><b>")
                        .append(esc(courseName(str(c, "name")))).append(" ").append(MountainServlet.levelChip(dist, asc, steep, true)).append(" <small lang=\"ko\">").append(esc(str(c, "name"))).append("</small></b><span>")
                        .append(String.format(Locale.ROOT, "%.2f km", dist / 1000.0))
                        .append(asc != null ? String.format(Locale.US, " · %,d m ascent", asc) : "")
                        .append(steep != null && steep >= MountainServlet.STEEP_STEPS[1] ? String.format(Locale.ROOT, " · steepest 1 km %.0f%%", steep) : "")
                        .append(" · about ").append(hours(dist, asc)).append("</span><span class=\"go\">")
                        .append("<a href=\"").append(REL).append("/index.html#c=").append(esc(id)).append("\">3D fly-through</a>")
                        .append("<a href=\"").append(REL).append("/hike.html#c=").append(esc(id)).append("\">Follow (GPS)</a>");
                double[] th = MountainServlet.trailhead(c, peak);
                if (th != null) b.append("<a class=\"way\" href=\"").append(esc(googleTo(th))).append("\" target=\"_blank\" rel=\"noopener\">🚌 Directions</a>");
                b.append("</span></li>");
            }
            b.append("</ul>");
        }
        b.append("<p class=\"dim\">Times are estimates at 4 km/h plus 1 hour per 600 m of ascent. Trail data is for reference - always follow signs and closures on site. "
                + "The 3D and GPS screens are in Korean; the map and route work the same. 🚌 Directions opens Google Maps transit directions from where you are to the trailhead. "
                + "Difficulty (Easy to Expert) is routefly's estimate from distance and ascent, not an official grade; 📈 Elevation shows the slope of each section like the park trail boards.</p></section>");
        List<String[]> qa = faq(peak, name, courses, parking);
        b.append("<section class=\"faq\"><h2>").append(esc(name)).append(" FAQ</h2><dl>");
        for (String[] x : qa) b.append("<dt>").append(esc(x[0])).append("</dt><dd>").append(esc(x[1])).append("</dd>");
        b.append("</dl></section>").append(MountainServlet.faqLd(qa));
        b.append(tips());
        if (!nearby.isEmpty()) {
            b.append("<section><h2>Nearby famous mountains</h2><ul class=\"ms\">");
            for (Object[] n : nearby) {
                JsonObject o = (JsonObject) n[0];
                b.append("<li><a href=\"").append(esc(Roman.slug(id(o)))).append("\">").append(esc(name(o)))
                        .append(" <small>").append(Math.round((Double) n[1] / 1000)).append(" km</small></a></li>");
            }
            b.append("</ul></section>");
        }
        return b.append(foot(REL + "/m/" + MountainServlet.enc(ko))).toString();
    }

    /** 순수 함수 - 구글 지도 대중교통 길찾기(도착 = 들머리, 출발은 내 위치). 외국인은 카카오맵보다 구글 지도에 익숙. */
    static String googleTo(double[] p) {
        return String.format(Locale.ROOT, "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f&travelmode=transit", p[0], p[1]);
    }

    /** 안전 안내 - 외국인 등산객용(응급 119 · 관광 안내 1330 · 산불조심기간). */
    static String tips() {
        return "<section><h2>Safety tips</h2><ul class=\"tips\">"
                + "<li>Emergency (fire &amp; rescue): call <b>119</b> - interpretation is available. Tell them the number on the nearest trail post (국가지점번호 / 다목적위치표지판).</li>"
                + "<li>Korea Travel Hotline (24 h, English): <b>1330</b>.</li>"
                + "<li>Some trails close during the wildfire prevention seasons (about Feb 1 - May 15 and Nov 1 - Dec 15) and in bad weather.</li>"
                + "<li>Start early and plan to be off the mountain before sunset. Carry water, a rain jacket and a headlamp.</li></ul></section>";
    }

    /** 길 이름에서 영어로 옮길 낱말(긴 것 먼저) - 나머지는 로마자. */
    private static final String[][] ROUTE_WORDS = {
        {"평화의 길", "Peace Trail"}, {"자전거길", "Bike Path"}, {"둘레길", "Dulle-gil"}, {"숲길", "Forest Trail"}, {"트레일", "Trail"}, {"정맥", "Jeongmaek"}};

    /** 순수 함수 - 걷기 · 자전거 길 영어 이름("지리산둘레길" → "Jirisan Dulle-gil", "해파랑길" → "Haeparang Trail", "한강 자전거길(서울)" → "Hangang Bike Path (Seoul)"). */
    static String routeName(String ko) {
        if (ko == null) return "";
        String s = ko;
        for (String[] w : ROUTE_WORDS) s = s.replace(w[0], " " + w[1] + " ");
        s = s.replaceAll("길(?=$|[\\s(])", " Trail ");   // 끝의 "길"(해파랑길 · 남파랑길)
        return Roman.of(s).replace("(", " (").replaceAll("\\s+", " ").replaceAll("\\( ", "(").replaceAll(" \\)", ")").trim();
    }

    /** 순수 함수 - 묶음 제목 영어(series.json groups 의 title). 모르는 것은 로마자. */
    static String groupName(String ko) {
        if (ko == null) return "";
        switch (ko) {
            case "국토종주 자전거길": return "Cross-country bike paths";
            case "국가숲길": return "National forest trails";
            case "코리아둘레길": return "Korea Dulle-gil";
            case "백두대간 · 정맥": return "Baekdudaegan & Jeongmaek ridges";
            case "100대 명산": return "100 Famous Mountains";
            default: return routeName(ko);
        }
    }

    /** 순수 함수 - 영어 목록(/en/m/): 로마자 차례, 한글 이름 · 좌표(내 근처 찾기 - js/mountain-en.js), 아래에 걷기 · 자전거 길(groups - data/series.json). */
    static String indexPage(JsonArray peaks, JsonArray groups, String base) {
        String desc = "Hiking trails, weather and sunrise for all " + peaks.size() + " of Korea's 100 Famous Mountains (Korea Forest Service) - "
                + "Seoraksan, Jirisan, Hallasan, Bukhansan and more. Preview trails in 3D and follow them on your phone.";
        StringBuilder b = new StringBuilder(head("Korea's 100 Famous Mountains - Hiking Trails", desc, base + "/en/m/", base + "/m/", base));
        // 로고 옆 "Follow a trail ›" - 한국어 코스 모음의 "🥾 따라가기 ›" 와 같게(2026-10-17 홍TV님)
        b.append("<main><div class=\"logoRow\"><a class=\"logo\" href=\"").append(REL).append("/hike.html\"><img src=\"").append(REL)
                .append("/img/logo-dark.svg\" alt=\"routefly\" width=\"256\" height=\"80\"></a>")
                .append("<a class=\"goHike\" href=\"").append(REL).append("/hike.html\" title=\"Pick a trail and follow it on your phone - GPS, voice guide, SOS\">🥾 Follow a trail ›</a></div>")
                .append("<h1 class=\"idx\">Hiking · Walking · Cycling</h1>")   // 한국어 제목과 같게(2026-10-17 홍TV님)
                .append("<p class=\"lead\">Pick a mountain to see its trails to the summit, the weather, air quality and sunrise time - or pick a walking trail or bike path to see its route map.</p>")
                .append("<section id=\"near\"><details class=\"fold kind\" name=\"kind\" id=\"nearFold\"><summary><span class=\"ft\">📍 Near me</span>")
                .append("<span class=\"fs\">8 closest famous mountains</span><span class=\"fa\">▾</span></summary><div class=\"fb\"><div id=\"nearList\"></div></div></details></section>")
                .append("<div class=\"folds\">");
        // 접고 펴는 칸(2026-10-15 홍TV님 - /m/ 과 같게): ⛰️ Hiking(100 Famous Mountains · 백두대간) · 🥾 Walking · 🚴 Cycling
        List<JsonObject> list = new ArrayList<>();
        for (JsonElement e : peaks) list.add(e.getAsJsonObject());
        list.sort(Comparator.comparing(MountainEn::name));
        StringBuilder pl = new StringBuilder("<ul class=\"ms\" id=\"peakList\">");
        for (JsonObject o : list) {
            pl.append("<li><a href=\"").append(esc(Roman.slug(id(o)))).append("\" data-lat=\"").append(o.get("lat").getAsDouble()).append("\" data-lon=\"")
                    .append(o.get("lon").getAsDouble()).append("\">").append(esc(name(o))).append(" <small lang=\"ko\">").append(esc(id(o))).append("</small></a></li>");
        }
        pl.append("</ul>");
        String[][] kinds = {{"hike", "⛰️ Hiking"}, {"walk", "🥾 Walking"}, {"bike", "🚴 Cycling"}};
        for (String[] k : kinds) {
            List<String[]> gs = new ArrayList<>();   // [제목(그림 붙음), 수, 목록 html, 제목]
            if (k[0].equals("hike") && !list.isEmpty()) gs.add(new String[] {"⛰️ 100 Famous Mountains", list.size() + "", pl.toString(), "100 Famous Mountains"});
            for (JsonElement e : groups) {
                JsonObject g = e.getAsJsonObject();
                String kind = str(g, "kind") != null ? str(g, "kind") : "walk";
                if (!kind.equals(k[0]) || !g.has("series")) continue;
                StringBuilder ul = new StringBuilder("<ul class=\"ms\">");
                int n = 0;
                for (JsonElement se : g.getAsJsonArray("series")) {
                    JsonObject sr = se.getAsJsonObject();
                    if (sr.has("summits") || str(sr, "name") == null) continue;   // 100대 명산은 위 목록
                    String q = str(sr, "prefix") != null ? "prefix=" + MountainServlet.enc(str(sr, "prefix"))
                            : "trail=" + MountainServlet.enc(str(sr, "match") != null ? str(sr, "match") : str(sr, "name"));
                    String en = routeName(str(sr, "name"));
                    ul.append("<li><a href=\"").append(REL).append("/route.html?").append(esc(q)).append("&amp;name=").append(esc(MountainServlet.enc(en)))
                            .append("&amp;back=en\">").append(esc(en)).append(sr.has("km") ? " <small>" + sr.get("km").getAsInt() + " km</small>" : "")
                            .append(" <small lang=\"ko\">").append(esc(str(sr, "name"))).append("</small></a></li>");
                    n++;
                }
                if (n > 0) gs.add(new String[] {(str(g, "icon") != null ? str(g, "icon") + " " : "") + groupName(str(g, "title")), n + "", ul.append("</ul>").toString(), groupName(str(g, "title"))});
            }
            if (gs.isEmpty()) continue;
            List<String> titles = new ArrayList<>();
            for (String[] g : gs) titles.add(g[3]);
            b.append("<details class=\"fold kind\" name=\"kind\"><summary><span class=\"ft\">").append(esc(k[1])).append("</span><span class=\"fs\">")
                    .append(esc(String.join(" · ", titles))).append("</span><span class=\"fa\">▾</span></summary><div class=\"fb\">");
            for (String[] g : gs) {
                b.append("<details class=\"fold group\" name=\"group\"><summary><span class=\"ft\">").append(esc(g[0])).append("</span><span class=\"fs\">").append(g[1])
                        .append("</span><span class=\"fa\">▾</span></summary>").append(g[2]).append("</details>");
            }
            b.append("</div></details>");
        }
        b.append("</div>");
        b.append("<p class=\"dim\">Trail and bike path maps show every section with checkpoints; place names on the map are in Korean.</p>");
        b.append(tips());
        return b.append("<section id=\"fun\" class=\"fun\" hidden></section>")   // 🔮 just for fun(js/mountain-en.js - 2026-10-17)
                .append(foot(REL + "/m/")).toString();
    }

    static String notFoundPage(String key, String base) {
        return head("Mountain not found", "Korea's 100 Famous Mountains - hiking trails", base + "/en/m/", base + "/m/", base)
                + "<main><h1>Mountain not found</h1><p>“" + esc(key) + "” is not in the list of Korea's 100 Famous Mountains. <a href=\"" + REL
                + "/en/m/\">See all mountains</a></p>" + foot(REL + "/m/");
    }

    private static String head(String title, String desc, String url, String koUrl, String base) {
        return head(title, desc, url, koUrl, base, null);
    }

    /** og - 공유 그림 주소(산마다 OgServlet, null 이면 기본 img/og.png). */
    private static String head(String title, String desc, String url, String koUrl, String base, String og) {
        String t = esc(title) + " - routefly", d = esc(desc);
        return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
                + "<title>" + t + "</title><meta name=\"description\" content=\"" + d + "\">"
                + "<link rel=\"canonical\" href=\"" + esc(url) + "\">"
                + "<link rel=\"alternate\" hreflang=\"en\" href=\"" + esc(url) + "\"><link rel=\"alternate\" hreflang=\"ko\" href=\"" + esc(koUrl) + "\">"
                + "<link rel=\"alternate\" hreflang=\"x-default\" href=\"" + esc(koUrl) + "\">"
                + "<meta property=\"og:type\" content=\"website\"><meta property=\"og:site_name\" content=\"routefly\"><meta property=\"og:locale\" content=\"en_US\">"
                + "<meta property=\"og:title\" content=\"" + t + "\"><meta property=\"og:description\" content=\"" + d + "\">"
                + "<meta property=\"og:url\" content=\"" + esc(url) + "\"><meta property=\"og:image\" content=\"" + esc(og != null ? og : base + "/img/og.png?v=2") + "\">"
                + "<meta property=\"og:image:width\" content=\"1200\"><meta property=\"og:image:height\" content=\"630\">"
                + "<link rel=\"icon\" type=\"image/svg+xml\" href=\"" + REL + "/favicon.svg?v=2\"><link rel=\"apple-touch-icon\" href=\"" + REL + "/img/apple-icon-180.png\"><meta name=\"theme-color\" content=\"#11161d\">"
                + "<link rel=\"stylesheet\" href=\"" + REL + "/css/course-kit.css\"><link rel=\"stylesheet\" href=\"" + REL + "/css/mountain.css\"></head><body>";
    }

    /** koHref - 한국어 페이지 상대 주소(터널 https 에서 http 절대 주소가 막혔음 - 화면의 한/EN 단추도 이 링크를 씀). */
    private static String foot(String koHref) {
        return "<p class=\"dim\">Data: Korea Forest Service (100 Famous Mountains, hiking trails), Korea National Park Service, Korea Meteorological Administration, "
                + "AirKorea, Durunubi (data.go.kr), © OpenStreetMap contributors. Names follow the Revised Romanization of Korean. "
                + "<a href=\"" + esc(koHref) + "\" hreflang=\"ko\" lang=\"ko\">한국어</a> · <a href=\"" + REL + "/privacy.html\">Privacy (Korean)</a></p>"
                + "<p class=\"support\" id=\"support\" hidden></p>"   // ☕ Support(설정 donate.en.url 이 있을 때만 mountain-en.js 가 보임)
                + "<p class=\"brand\"><a href=\"" + REL + "/hike.html\"><img src=\"" + REL + "/img/logo-dark.svg\" alt=\"routefly\" width=\"160\" height=\"50\"> Open app ›</a></p></main>"
                + "<script src=\"" + REL + "/js/course-kit.js\"></script><script src=\"" + REL + "/js/mountain-en.js\"></script></body></html>";
    }

    private static String esc(String s) {
        return ShareServlet.esc(s == null ? "" : s);
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
