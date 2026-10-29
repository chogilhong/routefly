package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 장소 이름 → 좌표(V-World 검색 API, 2026-10-29 홍TV님 "산청군청 근처 숙소"). */
public class PlaceServletTest {

    @Test
    public void parseAndQuery() {
        String ok = "{\"response\":{\"status\":\"OK\",\"result\":{\"items\":[{\"title\":\"산청군청\",\"address\":{\"road\":\"경상남도 산청군 시험로 1\",\"parcel\":\"\"},\"point\":{\"x\":\"127.8730001\",\"y\":\"35.4150001\"}},"
                + "{\"title\":\"바깥\",\"point\":{\"x\":\"10\",\"y\":\"10\"}}]}}}";
        JsonObject o = PlaceServlet.parse(ok);
        assertEquals("우리나라 안 좌표만", 1, o.getAsJsonArray("places").size());
        JsonObject p = o.getAsJsonArray("places").get(0).getAsJsonObject();
        assertEquals("산청군청", p.get("name").getAsString());
        assertEquals("경상남도 산청군 시험로 1", p.get("addr").getAsString());
        assertEquals(35.415, p.get("lat").getAsDouble(), 1e-6);
        String dup = "{\"response\":{\"status\":\"OK\",\"result\":{\"items\":[{\"title\":\"경상남도산청군청\",\"address\":{\"road\":\"경상남도 산청군 시험로 1\"},\"point\":{\"x\":\"127.87300\",\"y\":\"35.41500\"}},"
                + "{\"title\":\"산청군청\",\"address\":{\"road\":\"경상남도 산청군 시험로 1\"},\"point\":{\"x\":\"127.87301\",\"y\":\"35.41501\"}},{\"title\":\"산청군청\",\"address\":{\"road\":\"경상남도 산청군 다른로 2\"},\"point\":{\"x\":\"127.9\",\"y\":\"35.4\"}}]}}}";
        assertEquals("주소 · 좌표가 같은 곳은 하나만", 2, PlaceServlet.parse(dup).getAsJsonArray("places").size());
        // 실제 V-World 답(2026-10-29 PC): 같은 주소에 좌표가 조금씩 다른 셋
        String real = "{\"response\":{\"status\":\"OK\",\"result\":{\"items\":["
                + "{\"title\":\"산청군청\",\"address\":{\"road\":\"경상남도 산청군 산청읍 산엔청로 1\"},\"point\":{\"x\":\"127.873658\",\"y\":\"35.415461\"}},"
                + "{\"title\":\"산청군청\",\"address\":{\"road\":\"경상남도 산청군 산청읍 산엔청로 1\"},\"point\":{\"x\":\"127.873421\",\"y\":\"35.415562\"}},"
                + "{\"title\":\"경상남도산청군청\",\"address\":{\"road\":\"경상남도 산청군 산청읍 산엔청로 1\"},\"point\":{\"x\":\"127.873357\",\"y\":\"35.415478\"}}]}}}";
        assertEquals("같은 주소는 하나만", 1, PlaceServlet.parse(real).getAsJsonArray("places").size());
        assertEquals(0, PlaceServlet.parse("{\"response\":{\"status\":\"NOT_FOUND\"}}").getAsJsonArray("places").size());
        assertNull("키 오류 등은 null(로그에 답을 남기지 않음)", PlaceServlet.parse("{\"response\":{\"status\":\"ERROR\",\"error\":{\"text\":\"x\"}}}"));
        assertNull(PlaceServlet.parse("not json"));
        assertNull("한 글자는 안 됨", PlaceServlet.query("산"));
        assertEquals("꺾쇠 · 숨은 글자 뺌", "산청군청", PlaceServlet.query(" 산청<군>청​ "));
        String u = PlaceServlet.url("K", "산청 군청", "address", "road", "routefly.kr");
        assertTrue(u.startsWith(PlaceServlet.URL + "?service=search&request=search&version=2.0&crs=EPSG:4326") && u.contains("&type=address&category=road&query=%EC%82%B0%EC%B2%AD+%EA%B5%B0%EC%B2%AD") && u.contains("&domain=routefly.kr"));
    }

    @Test
    public void futurePartnerSlots() {
        java.util.Map<String, String> c = new java.util.HashMap<>();
        c.put("partner.yeogi.url", "https://www.yeogi.com/search?k={q}");
        c.put("partner.yanolja.url", "https://www.yanolja.com/no-placeholder");
        c.put("partner.hotels.url", "https://evil.example/{q}");
        JsonObject b = PartnersServlet.body(c::get);
        assertTrue("{q} 가 든 그 사이트 링크만", b.has("yeogi"));
        assertFalse("자리 표시가 없으면 뺌", b.has("yanolja"));
        assertFalse("다른 사이트는 뺌", b.has("hotels"));
    }
}
