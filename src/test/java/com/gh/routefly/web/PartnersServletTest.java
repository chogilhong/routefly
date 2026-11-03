package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 제휴 · 후원 링크(2026-10-15). 링크 값은 테스트 데이터. */
public class PartnersServletTest {

    @Test
    public void onlyAllowedLinks() {
        Map<String, String> c = Map.of(
                "partner.coupang.headlamp", "https://link.coupang.com/a/test1, https://evil.example/x,https://coupa.ng/b,https://coupa.ng/c,https://coupa.ng/d",
                "partner.coupang.glove", "https://link.coupang.com/a/g",
                "partner.coupang.stick", "https://evil.example/a",
                "partner.coupang.crampon", "https://coupa.ng/x\"><script>",
                "partner.agoda.url", "https://www.agoda.com/partners/partnersearch.aspx?cid=1&lat={lat}",
                "partner.trip.url", "https://kr.trip.com/hotels/list?Allianceid=1&lat={lat}",
                "donate.url", "https://toss.me/test",
                "donate.en.url", "https://www.paypal.com/ncp/payment/TEST");
        JsonObject o = PartnersServlet.body(c::get);
        assertEquals("쉼표로 여러 개 - 다른 곳은 빼고 3개까지", "[\"https://link.coupang.com/a/test1\",\"https://coupa.ng/b\",\"https://coupa.ng/c\"]",
                o.getAsJsonObject("coupang").get("headlamp").toString());
        assertEquals("[\"https://link.coupang.com/a/g\"]", o.getAsJsonObject("coupang").get("glove").toString());
        assertFalse("다른 곳 주소는 뺌", o.getAsJsonObject("coupang").has("stick"));
        assertFalse("따옴표 · 꺾쇠가 든 주소는 뺌", o.getAsJsonObject("coupang").has("crampon"));
        assertTrue(o.get("agoda").getAsString().startsWith("https://www.agoda.com/"));
        assertTrue(o.get("trip").getAsString().startsWith("https://kr.trip.com/"));
        assertFalse("트립닷컴 흉내 주소는 뺌", PartnersServlet.body(Map.of("partner.trip.url", "https://www.trip.com.evil.example/x")::get).has("trip"));
        assertEquals("https://toss.me/test", o.get("donate").getAsString());
        assertEquals("https://www.paypal.com/ncp/payment/TEST", o.get("donateEn").getAsString());
        JsonObject biz = PartnersServlet.body(java.util.Map.of("biz.name", "시험상호", "biz.phone", "<b>010-0000-0000")::get).getAsJsonObject("biz");
        assertEquals("시험상호", biz.get("name").getAsString());
        assertEquals("꺾쇠는 뺌", "b010-0000-0000", biz.get("phone").getAsString());
        assertFalse("없으면 안 보냄", biz.has("address"));
        assertFalse("영어 후원은 PayPal · Ko-fi 만", PartnersServlet.body(Map.of("donate.en.url", "https://toss.me/x")::get).has("donateEn"));
    }

    @Test
    public void emptyConfigGivesNothing() {
        JsonObject o = PartnersServlet.body(k -> null);
        assertEquals(0, o.getAsJsonObject("coupang").size());
        assertFalse(o.has("agoda") || o.has("trip") || o.has("donate") || o.has("donateEn"));
        assertFalse(PartnersServlet.allowed("http://toss.me/a", "https://"));
        assertFalse(PartnersServlet.allowed("https://", "https://"));
        // 2026-10-28: 트립닷컴 검색 결과 링크는 500자를 넘음 - 2000자까지, 까닭은 why 로
        String longTrip = "https://kr.trip.com/hotels/list?" + "a=1&".repeat(200);
        assertTrue(longTrip.length() > 500 && PartnersServlet.allowed(longTrip, "https://kr.trip.com/"));
        assertTrue(PartnersServlet.why("https://kr.trip.com/x " , "https://kr.trip.com/").startsWith("빈칸"));
        assertTrue(PartnersServlet.why("https://kr.trip.com", "https://kr.trip.com/").startsWith("주소 시작"));
        assertTrue(PartnersServlet.why("https://kr.trip.com/" + "x".repeat(2000), "https://kr.trip.com/").startsWith("길이"));
        // 트립닷컴 · 아고다는 주소 이름으로(2026-10-28 - "https://kr.trip.com?Allianceid=…" 처럼 / 없이 ? 가 붙은 링크가 걸러졌음)
        assertNull(PartnersServlet.whyHost("https://kr.trip.com?Allianceid=1&SID=2", "trip.com"));
        assertNull(PartnersServlet.whyHost("https://trip.com/t/abc", "trip.com"));
        assertNull(PartnersServlet.whyHost("https://www.agoda.com/partners/x?cid=1", "agoda.com"));
        assertTrue(PartnersServlet.whyHost("http://kr.trip.com/x", "trip.com").startsWith("https"));
        assertTrue(PartnersServlet.whyHost("https://kr.trip.com.evil.kr/x", "trip.com").startsWith("주소 이름"));
        assertTrue(PartnersServlet.whyHost("https://eviltrip.com/x", "trip.com").startsWith("주소 이름"));
        assertNotNull(PartnersServlet.whyHost("https://trip.com@evil.kr/x", "trip.com"));
    }

    /** 쏘카(링크프라이스 경유, 2026-11-03): click.linkprice.com 대표 링크만 받음 - 흉내 주소 · http 는 뺌. 산 페이지에 쏘카 칸이 있음. */
    @Test
    public void socarLinkpriceOnly() {
        assertEquals("https://click.linkprice.com/click.php?m=socar&a=TEST",
                PartnersServlet.body(Map.of("partner.socar.url", "https://click.linkprice.com/click.php?m=socar&a=TEST")::get).get("socar").getAsString());
        assertFalse(PartnersServlet.body(Map.of("partner.socar.url", "https://click.linkprice.com.evil.example/x")::get).has("socar"));
        assertFalse(PartnersServlet.body(Map.of("partner.socar.url", "http://click.linkprice.com/x")::get).has("socar"));
        assertFalse("비면 없음", PartnersServlet.body(k -> null).has("socar"));
        com.google.gson.JsonObject peak = com.google.gson.JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.8226,\"lon\":128.1229}").getAsJsonObject();
        com.google.gson.JsonObject c = com.google.gson.JsonParser.parseString("{\"course_id\":\"k1\",\"name\":\"해인사 → 상왕봉\",\"distance_m\":4000,\"ascent_m\":600,"
                + "\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8226,\"end_lon\":128.1229}").getAsJsonObject();
        String page = MountainServlet.page(peak, new java.util.ArrayList<>(java.util.List.of(c)), new java.util.ArrayList<>(), null, "");
        int so = page.indexOf("<p class=\"stays\" id=\"socar\" hidden></p>");
        assertTrue("코스 목록 아래 숨긴 쏘카 칸 - 안내 글(찜 · 예상 시간) 아래", so > page.indexOf("</ul>") && so > page.indexOf("<p class=\"dim\">예상 시간은 "));
        try {
            assertTrue("아래 칸과 띄움", java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/css/mountain.css")).contains("#socar { margin-bottom:28px; }"));
        } catch (java.io.IOException e) { throw new AssertionError(e); }
    }

    /** 호텔스컴바인(링크프라이스 경유, 2026-11-03): 대표 링크(click.linkprice.com)도, 호텔스컴바인 주소도 받음 - 흉내 주소는 뺌. */
    @Test
    public void hotelsViaLinkprice() {
        assertEquals("https://click.linkprice.com/click.php?m=hcombine2&a=TEST",
                PartnersServlet.body(Map.of("partner.hotels.url", "https://click.linkprice.com/click.php?m=hcombine2&a=TEST")::get).get("hotels").getAsString());
        assertTrue(PartnersServlet.body(Map.of("partner.hotels.url", "https://www.hotelscombined.co.kr/?a=1")::get).has("hotels"));
        assertFalse(PartnersServlet.body(Map.of("partner.hotels.url", "https://click.linkprice.com.evil.example/x")::get).has("hotels"));
        assertFalse(PartnersServlet.body(Map.of("partner.hotels.url", "http://click.linkprice.com/x")::get).has("hotels"));
    }

    /** Airalo 한국 eSIM(링크프라이스 딥링크, 2026-11-03): linkprice.com · airalo.com 만, 영어 산 페이지에 eSIM 칸. */
    @Test
    public void airaloEsim() {
        assertTrue(PartnersServlet.body(Map.of("partner.airalo.url", "https://click.linkprice.com/click.php?m=airalo&a=TEST&tu=x")::get).has("airalo"));
        assertTrue(PartnersServlet.body(Map.of("partner.airalo.url", "https://www.airalo.com/south-korea-esim")::get).has("airalo"));
        assertFalse(PartnersServlet.body(Map.of("partner.airalo.url", "https://airalo.com.evil.example/x")::get).has("airalo"));
        com.google.gson.JsonObject peak = com.google.gson.JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.8226,\"lon\":128.1229}").getAsJsonObject();
        com.google.gson.JsonObject c = com.google.gson.JsonParser.parseString("{\"course_id\":\"k1\",\"name\":\"해인사 → 상왕봉\",\"distance_m\":4000,\"ascent_m\":600,"
                + "\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8226,\"end_lon\":128.1229}").getAsJsonObject();
        String en = MountainEn.page(peak, new java.util.ArrayList<>(java.util.List.of(c)), new java.util.ArrayList<>(), null, "");
        assertTrue("영어 산 페이지 코스 목록 아래 숨긴 eSIM 칸", en.contains("<p class=\"stays\" id=\"esim\" hidden></p>"));
    }

    /** 🎒 맨 위 상품 하나(2026-11-03 "가민 택틱스 8"): "이름|그림|링크" - 링크는 쿠팡 파트너스, 그림은 쿠팡 그림 서버만. */
    @Test
    public void featuredProduct() {
        JsonObject f = PartnersServlet.body(Map.of("partner.coupang.featured", "가민 택틱스 8 세라코트 AMOLED|https://thumbnail.coupangcdn.com/x.jpg|https://link.coupang.com/a/TEST")::get).getAsJsonObject("featured");
        assertEquals("가민 택틱스 8 세라코트 AMOLED", f.get("name").getAsString());
        assertEquals("https://thumbnail.coupangcdn.com/x.jpg", f.get("img").getAsString());
        assertEquals("https://link.coupang.com/a/TEST", f.get("href").getAsString());
        assertNull("링크가 쿠팡 파트너스가 아님", PartnersServlet.featured("시계|https://thumbnail.coupangcdn.com/x.jpg|https://www.coupang.com/vp/products/1"));
        assertNull("그림이 다른 서버", PartnersServlet.featured("시계|https://evil.example/x.jpg|https://link.coupang.com/a/T"));
        assertNull("그림 흉내 주소", PartnersServlet.featured("시계|https://coupangcdn.com.evil.example/x.jpg|https://link.coupang.com/a/T"));
        assertNull("세 칸이 아님", PartnersServlet.featured("시계|https://link.coupang.com/a/T"));
        assertNull("이름 없음", PartnersServlet.featured("|https://thumbnail.coupangcdn.com/x.jpg|https://link.coupang.com/a/T"));
        assertFalse("비면 없음", PartnersServlet.body(k -> null).has("featured"));
    }
}
