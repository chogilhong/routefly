package com.gh.routefly.web;

import static org.junit.Assert.*;

import com.google.gson.JsonObject;
import org.junit.Test;

/** 들머리 근처 숙박(TourAPI) - 2026-10-14. 응답 모양은 TourAPI 위치기반 목록 모양으로 만든 테스트 데이터(실제 숙소 아님). */
public class StaysServletTest {

    @Test
    public void parseKeepsKoreaOnly() {
        assertArrayEquals(new double[] {35.79, 128.12}, StaysServlet.parse("35.79", "128.12"), 1e-9);
        assertNull(StaysServlet.parse("51.5", "0.1"));
        assertNull(StaysServlet.parse("x", "128"));
        assertNull(StaysServlet.parse(null, null));
    }

    @Test
    public void cacheKeyRoundsTo100m() {
        assertEquals(StaysServlet.cacheKey(35.79012, 128.12049), StaysServlet.cacheKey(35.79049, 128.12011));
        assertEquals("35.790,128.120", StaysServlet.cacheKey(35.79012, 128.12049));
    }

    @Test
    public void urlEncodesKeyAndUsesLonAsX() {
        assertTrue("반려동물 동반여행 서비스", StaysServlet.PET_URL.contains("KorPetTourService2/locationBasedList2") && PetServlet.DEFAULT_URL.contains("KorPetTourService2/detailPetTour2"));
        String u = StaysServlet.url(StaysServlet.DEFAULT_URL, "a+b/c==", 35.79, 128.12, StaysServlet.typeOf(null));
        assertTrue(u, u.contains("serviceKey=a%2Bb%2Fc%3D%3D"));
        assertTrue(u, u.contains("mapX=128.120000&mapY=35.790000"));
        assertTrue(u, u.contains("contentTypeId=32") && u.contains("radius=5000") && u.contains("_type=json"));
        assertEquals("숙박은 5km 안에 없으면 20km 까지(설악산 소공원)", 20000, StaysServlet.wideRadius(false, "32"));
        assertEquals("반려동물도 20km", 20000, StaysServlet.wideRadius(true, "39"));
        assertEquals("음식점은 넓히지 않음", 0, StaysServlet.wideRadius(false, "39"));
        assertTrue("반려동물은 20km 까지 넓혀 봄", StaysServlet.url(StaysServlet.PET_URL, "k", 35.79, 128.12, "32", StaysServlet.PET_WIDE_M).contains("radius=20000"));
        assertTrue("식당은 음식점 39", StaysServlet.url(StaysServlet.DEFAULT_URL, "k", 35.79, 128.12, StaysServlet.typeOf("food")).contains("contentTypeId=39"));
        assertEquals("모르는 값은 숙박", "32", StaysServlet.typeOf("x"));
    }

    @Test
    public void bodyReadsArrayOneAndEmpty() {
        String two = "{\"response\":{\"header\":{\"resultCode\":\"0000\",\"resultMsg\":\"OK\"},\"body\":{\"items\":{\"item\":["
                + "{\"title\":\"숙소A\",\"contentid\":\"2879\",\"addr1\":\"경남 합천군 가야면\",\"tel\":\"055-000-0000\",\"mapx\":\"128.12\",\"mapy\":\"35.79\",\"dist\":\"512.3\"},"
                + "{\"title\":\"숙소B\",\"addr1\":\"\",\"tel\":\"\",\"mapx\":\"128.13\",\"mapy\":\"35.80\",\"dist\":\"1200\"}]},\"totalCount\":2}}}";
        JsonObject o = StaysServlet.body(two);
        assertEquals(2, o.getAsJsonArray("stays").size());
        JsonObject a = o.getAsJsonArray("stays").get(0).getAsJsonObject();
        assertEquals("숙소A", a.get("name").getAsString());
        assertEquals(512, a.get("dist_m").getAsLong());
        assertEquals("반려동물 정보용 contentid", "2879", a.get("id").getAsString());
        assertFalse("빈 전화는 넣지 않음", o.getAsJsonArray("stays").get(1).getAsJsonObject().has("tel"));
        assertEquals("한국관광공사", o.get("source").getAsString());

        String one = "{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":{\"item\":"
                + "{\"title\":\"숙소C\",\"mapx\":\"128.1\",\"mapy\":\"35.7\"}},\"totalCount\":1}}}";
        assertEquals(1, StaysServlet.body(one).getAsJsonArray("stays").size());
        String none = "{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":\"\",\"totalCount\":0}}}";
        assertEquals(0, StaysServlet.body(none).getAsJsonArray("stays").size());
    }

    @Test
    public void bodyRejectsErrors() {
        assertNull(StaysServlet.body("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>"));
        assertNull(StaysServlet.body("{\"response\":{\"header\":{\"resultCode\":\"30\",\"resultMsg\":\"SERVICE_KEY_IS_NOT_REGISTERED_ERROR\"}}}"));
    }

    @Test
    public void probeScrubsKey() {
        assertEquals("a *** b ***", PetTourProbe.scrub("a k+/= b k%2B%2F%3D", "k+/="));
    }

    /** 실제 응답(2026-10-14 PetTourProbe) - 반려동물 동반여행 서비스는 문서(80 · 82)와 달리 32 · 39 에 답함. 제주 · 가야산 20km 는 0곳. */
    @Test
    public void realPetListResponses() throws Exception {
        com.google.gson.JsonArray st = StaysServlet.body(PetServletTest.read("pet-probe-bukhansan-32.json")).getAsJsonArray("stays");
        assertEquals("totalCount 12 중 첫 쪽 10건(확인 프로그램은 numOfRows=10)", 10, st.size());
        assertEquals("사월 한옥", st.get(0).getAsJsonObject().get("name").getAsString());
        assertTrue(st.get(0).getAsJsonObject().has("id"));
        assertEquals(4, StaysServlet.body(PetServletTest.read("pet-probe-bukhansan-39.json")).getAsJsonArray("stays").size());
        for (String f : new String[] {"bukhansan-80", "bukhansan-82", "jeju-32", "jeju-39", "gayasan-32", "gayasan-39"})
            assertEquals(f, 0, StaysServlet.body(PetServletTest.read("pet-probe-" + f + ".json")).getAsJsonArray("stays").size());
    }
}
