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

    private static JsonObject places(double[]... pts) {
        JsonObject o = new JsonObject();
        com.google.gson.JsonArray a = new com.google.gson.JsonArray();
        for (double[] p : pts) { JsonObject x = new JsonObject(); x.addProperty("name", "곳" + a.size()); x.addProperty("lat", p[0]); x.addProperty("lon", p[1]); a.add(x); }
        o.add("places", a);
        return o;
    }

    @Test
    public void spacedQueries() {
        // "설악산 소공원"(2026-10-29 홍TV님 화면) - 그대로 · 붙여 쓰기로 없음 → 설악산을 찾고 소공원 중 30km 안만
        java.util.Map<String, JsonObject> v = new java.util.HashMap<>();
        v.put("설악산", places(new double[] {38.119, 128.465}));
        v.put("소공원", places(new double[] {37.5, 127.0}, new double[] {38.172, 128.488}));
        JsonObject r = PlaceServlet.resolve("설악산 소공원", q -> v.getOrDefault(q, places()));
        assertEquals("멀리 있는 소공원(서울)은 빼고 설악산 근처 것만", 1, r.getAsJsonArray("places").size());
        assertEquals(38.172, r.getAsJsonArray("places").get(0).getAsJsonObject().get("lat").getAsDouble(), 1e-9);
        assertFalse(r.has("partial"));
        v.remove("소공원");
        JsonObject s = PlaceServlet.resolve("설악산 소공원", q -> v.getOrDefault(q, places()));
        assertEquals("뒤 낱말을 못 찾으면 앞 낱말 자리 + partial", "설악산", s.get("partial").getAsString());
        v.put("설악산소공원", places(new double[] {38.17, 128.49}));
        assertFalse("붙여 쓴 이름이 있으면 그것", PlaceServlet.resolve("설악산 소공원", q -> v.getOrDefault(q, places())).has("partial"));
        assertTrue("키 · 연결 문제는 unavailable", PlaceServlet.resolve("설악산 소공원", q -> null).has("unavailable"));
        assertEquals("띄어쓰기 없는 말은 한 번만", 0, PlaceServlet.resolve("없는곳", q -> places()).getAsJsonArray("places").size());
    }

    @Test
    public void futurePartnerSlots() {
        java.util.Map<String, String> c = new java.util.HashMap<>();
        c.put("partner.yeogi.url", "https://www.yeogi.com/search?k={q}");
        c.put("partner.yanolja.url", "https://www.yanolja.com/no-placeholder");
        c.put("partner.hotels.url", "https://evil.example/{q}");
        JsonObject b = PartnersServlet.body(c::get);
        assertTrue("{q} 가 든 그 사이트 링크만", b.has("yeogi"));
        assertTrue("자리 표시가 없어도 그 사이트 링크면 받음(검색 화면으로)", b.has("yanolja"));
        assertFalse("다른 사이트는 뺌", b.has("hotels"));
    }
}
