package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 영어 산 페이지(/en/m/ - 2026-10-15) · 로마자 표기. */
public class MountainEnTest {

    @Test
    public void romanization() {
        assertEquals("Seoraksan", Roman.of("설악산"));     // ㄹ 받침이 모음 앞에서 r
        assertEquals("Hallasan", Roman.of("한라산"));      // ㄴ+ㄹ → ll
        assertEquals("Songnisan", Roman.of("속리산"));     // ㄱ+ㄹ → ng+n
        assertEquals("Bukhansan", Roman.of("북한산"));     // 이름은 거센소리 안 적음
        assertEquals("Deogyusan", Roman.of("덕유산"));
        assertEquals("Baengnokdam", Roman.of("백록담"));
        assertEquals("Gangwon", Roman.of("강원"));
        assertEquals("Jungsan-ri", Roman.of("중산리"));
        assertEquals("Osaek - Daecheongbong", Roman.of("오색 - 대청봉"));
        assertEquals("Duryubong 6bong", Roman.of("두류봉 6봉"));
        assertEquals("baegunsan-gwangyang", Roman.slug("백운산(광양)"));
        assertEquals("", Roman.of(null));
    }

    @Test
    public void names() {
        assertEquals("Osaek visitor center - Daecheongbong", MountainEn.courseName("오색탐방지원센터 - 대청봉"));
        assertEquals("Seoraksan · Baekdamsa course (round trip)", MountainEn.courseName("설악산 · 백담사코스(왕복)"));
        assertEquals("Bukhansan Baegundae", MountainEn.summitName("북한산백운대", "북한산"));
        assertEquals("Daecheongbong", MountainEn.summitName("대청봉", "설악산"));
        assertEquals("Baegunsan (Gwangyang)", MountainEn.name(JsonParser.parseString("{\"id\":\"백운산(광양)\"}").getAsJsonObject()));
        assertEquals("2 h 18 min", MountainEn.hours(3980, 779));
        assertEquals("45 min", MountainEn.hours(3000, null));
    }

    @Test
    public void pages() {
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"설악산\",\"name\":\"설악산\",\"summit\":\"대청봉\",\"elev\":1708,\"height\":1734,\"lat\":38.119,\"lon\":128.465},"
                + "{\"id\":\"점봉산\",\"name\":\"점봉산\",\"lat\":38.05,\"lon\":128.43},{\"id\":\"백운산(광양)\",\"name\":\"백운산\",\"lat\":35.1,\"lon\":127.6}]").getAsJsonArray();
        assertEquals("설악산", MountainEn.find(peaks, "Seoraksan").get("id").getAsString());
        assertEquals("백운산(광양)", MountainEn.find(peaks, "baegunsan-gwangyang").get("id").getAsString());
        assertNull(MountainEn.find(peaks, "fuji"));
        JsonObject seorak = peaks.get(0).getAsJsonObject(), c = new JsonObject();
        c.addProperty("course_id", "knps-1");
        c.addProperty("name", "오색탐방지원센터 - 대청봉");
        c.addProperty("distance_m", 5000);
        c.addProperty("ascent_m", 1300);
        List<JsonObject> cs = new ArrayList<>(List.of(c));
        List<Object[]> nb = MountainServlet.nearby(peaks, seorak, 6, MountainServlet.NEARBY_M);
        String html = MountainEn.page(seorak, cs, nb, 2, "https://routefly.kr/routefly");
        assertTrue(html.startsWith("<!DOCTYPE html><html lang=\"en\">"));
        assertTrue(html.contains("<title>Seoraksan Hiking Trails, Weather &amp; Sunrise - routefly</title>"));
        assertTrue(html.contains("<link rel=\"canonical\" href=\"https://routefly.kr/routefly/en/m/seoraksan\">"));
        assertTrue("hreflang 한국어", html.contains("hreflang=\"ko\" href=\"https://routefly.kr/routefly/m/%EC%84%A4%EC%95%85%EC%82%B0\""));
        assertTrue(html.contains("<h1>Seoraksan Hiking Trails <small lang=\"ko\">설악산</small></h1>"));
        assertTrue(html.contains("Summit Daecheongbong <span lang=\"ko\">(대청봉)</span> 1,708 m"));
        assertTrue(html.contains("<b>Osaek visitor center - Daecheongbong <i class=\"lv lv3\">Advanced</i> <small lang=\"ko\">오색탐방지원센터 - 대청봉</small></b>"));
        assertTrue(html.contains("5.00 km · 1,300 m ascent · about 3 h 25 min"));
        assertTrue("앱으로(두 단계 위)", html.contains("href=\"../../index.html#c=knps-1\">3D fly-through") && html.contains("href=\"../../hike.html#c=knps-1\">Follow (GPS)"));
        assertTrue("가까운 산은 slug", html.contains("<a href=\"jeombongsan\">Jeombongsan <small>"));
        assertTrue("영어 문답 + JSON-LD", html.contains("<dt>How high is Seoraksan?</dt>") && html.contains("\"@type\":\"FAQPage\""));
        assertTrue(html.contains("There are 2 parking lots within 3 km"));
        assertTrue(html.contains("call <b>119</b>") && html.contains("src=\"../../js/mountain-en.js\""));
        JsonArray groups = JsonParser.parseString("[{\"kind\":\"walk\",\"title\":\"코리아둘레길\",\"series\":[{\"name\":\"해파랑길\"},{\"name\":\"지리산둘레길\",\"match\":\"지리산\",\"km\":289}]},"
                + "{\"kind\":\"bike\",\"series\":[{\"name\":\"한강 자전거길(서울)\",\"prefix\":\"osmb-1-\",\"km\":56}]},{\"kind\":\"hike\",\"series\":[{\"summits\":\"\"}]}]").getAsJsonArray();
        String idx = MountainEn.indexPage(peaks, groups, "https://routefly.kr/routefly");
        assertTrue(idx.contains("<a href=\"../../route.html?trail=%ED%95%B4%ED%8C%8C%EB%9E%91%EA%B8%B8&amp;name=Haeparang%20Trail&amp;back=en\">Haeparang Trail <small lang=\"ko\">해파랑길</small></a>"));
        assertTrue(idx.contains(">Jirisan Dulle-gil <small>289 km</small>"));
        assertTrue(idx.contains("route.html?prefix=osmb-1-&amp;name=Hangang%20Bike%20Path%20%28Seoul%29&amp;back=en\">Hangang Bike Path (Seoul)"));
        assertFalse("100대 명산 칸은 길 목록에서 뺌", idx.contains("Baekdudaegan ridge"));
        assertTrue("/m/ 처럼 접는 칸", idx.contains("<details class=\"fold kind\" name=\"kind\"><summary><span class=\"ft\">⛰️ Hiking</span><span class=\"fs\">100 Famous Mountains</span>"));
        assertTrue(idx.contains("<span class=\"ft\">🥾 Walking</span><span class=\"fs\">Korea Dulle-gil</span>") && idx.contains("<span class=\"ft\">Korea Dulle-gil</span><span class=\"fs\">2</span>"));
        assertTrue("로마자 차례", idx.indexOf(">Baegunsan (Gwangyang)") < idx.indexOf(">Jeombongsan") && idx.indexOf(">Jeombongsan") < idx.indexOf(">Seoraksan"));
        assertTrue("내 근처용 좌표", idx.contains("<a href=\"seoraksan\" data-lat=\"38.119\" data-lon=\"128.465\">Seoraksan <small lang=\"ko\">설악산</small></a>"));
        assertTrue(MountainEn.notFoundPage("<x>", "b").contains("&lt;x&gt;"));
    }

    @Test
    public void koreanPageLinksEnglish() {
        JsonObject gaya = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.82,\"lon\":128.12}").getAsJsonObject();
        String html = MountainServlet.page(gaya, new ArrayList<>(), new ArrayList<>(), null, "https://routefly.kr/routefly");
        assertTrue(html.contains("<link rel=\"alternate\" hreflang=\"en\" href=\"https://routefly.kr/routefly/en/m/gayasan\">"));
        assertTrue(html.contains("<a href=\"../en/m/gayasan\" hreflang=\"en\" lang=\"en\">English</a>"));
        assertTrue(SitemapServlet.sitemap("https://r.kr", List.of("가야산")).contains("<loc>https://r.kr/en/m/gayasan</loc>"));
        assertEquals("/en/m/seoraksan", Stats.pageKey("/en/m/Seoraksan"));
        assertEquals("/en/m/", Stats.pageKey("/en/m/"));
        assertNull(Stats.pageKey("/en/m/<x>"));
    }

    @Test
    public void routeNames() {
        assertEquals("DMZ Peace Trail", MountainEn.routeName("DMZ 평화의 길"));
        assertEquals("Namparang Trail", MountainEn.routeName("남파랑길"));
        assertEquals("Daegwallyeong Forest Trail", MountainEn.routeName("대관령숲길"));
        assertEquals("Baekdudaegan Trail", MountainEn.routeName("백두대간트레일"));
        assertEquals("Hanbuk Jeongmaek", MountainEn.routeName("한북정맥"));
        assertEquals("DMZ Peonchibol Dulle-gil", MountainEn.routeName("DMZ펀치볼둘레길"));
        assertEquals("Donghaean Bike Path (Gangwon)", MountainEn.routeName("동해안 자전거길(강원)"));
    }

    @Test
    public void directions() {
        JsonObject peak = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.8225,\"lon\":128.1228}").getAsJsonObject();
        JsonObject up = JsonParser.parseString("{\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8226,\"end_lon\":128.1229}").getAsJsonObject();
        JsonObject down = JsonParser.parseString("{\"start_lat\":35.8226,\"start_lon\":128.1229,\"end_lat\":35.80,\"end_lon\":128.09}").getAsJsonObject();
        assertArrayEquals("정상에서 먼 쪽이 들머리", new double[] {35.80, 128.09}, MountainServlet.trailhead(up, peak), 1e-9);
        assertArrayEquals("거꾸로 적힌 코스도", new double[] {35.80, 128.09}, MountainServlet.trailhead(down, peak), 1e-9);
        assertNull(MountainServlet.trailhead(new JsonObject(), peak));
        assertEquals("https://map.kakao.com/link/to/%EA%B0%80%EC%95%BC%EC%82%B0%20%EB%93%A4%EB%A8%B8%EB%A6%AC,35.800000,128.090000",
                MountainServlet.kakaoTo("가야산 들머리", new double[] {35.80, 128.09}));
        assertEquals("https://www.google.com/maps/dir/?api=1&destination=35.800000,128.090000&travelmode=transit", MountainEn.googleTo(new double[] {35.80, 128.09}));
        up.addProperty("course_id", "k1");
        up.addProperty("name", "해인사 - 상왕봉");
        up.addProperty("distance_m", 4000);
        String ko = MountainServlet.page(peak, new ArrayList<>(List.of(up)), new ArrayList<>(), null, "https://r.kr");
        assertTrue(ko.contains("<a class=\"way\" href=\"https://map.kakao.com/link/to/%EA%B0%80%EC%95%BC%EC%82%B0%20%EB%93%A4%EB%A8%B8%EB%A6%AC,35.800000,128.090000\" target=\"_blank\" rel=\"noopener\">🚌 가는 길</a>"));
        String en = MountainEn.page(peak, new ArrayList<>(List.of(up)), new ArrayList<>(), null, "https://r.kr");
        assertTrue(en.contains("href=\"https://www.google.com/maps/dir/?api=1&amp;destination=35.800000,128.090000&amp;travelmode=transit\" target=\"_blank\" rel=\"noopener\">🚌 Directions</a>"));
    }

    @Test
    public void levels() {   // course-kit.test.js "difficulty 단계" 와 같은 값
        assertEquals(3, MountainServlet.difficulty(12900, 1300, null));
        assertEquals(3, MountainServlet.difficulty(5000, 1300, null));
        assertEquals(1, MountainServlet.difficulty(4000, 350, null));
        assertEquals("남설악 → 대청봉", 3, MountainServlet.difficulty(4710, 1273, null));
        assertEquals("→ 가라피(길어져도 내려가지 않음)", 3, MountainServlet.difficulty(10450, 1480, null));
        assertEquals(0, MountainServlet.difficulty(2000, 20, null));
        assertEquals(4, MountainServlet.difficulty(20000, 2500, null));
        assertEquals(-1, MountainServlet.difficulty(0, null, null));
        assertEquals("<i class=\"lv lv2\">보통</i>", MountainServlet.levelChip(9000, 900, null, false));
        assertEquals("", MountainServlet.levelChip(0, null, null, true));
    }
}
