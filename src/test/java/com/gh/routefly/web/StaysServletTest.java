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

    /** 카카오 숙박 분류 + 관광공사 합치기(2026-10-29 홍TV님 - 구글처럼 근처 호텔이 나오게). 카카오 답 모양으로 만든 테스트 데이터(실제 숙소 아님). */
    @Test
    public void kakaoStaysMergeWithTour() {
        String k = "{\"documents\":["
                + "{\"place_name\":\"시험호텔 설악\",\"category_name\":\"여행 > 숙박 > 호텔\",\"road_address_name\":\"강원특별자치도 속초시 시험로 1\",\"address_name\":\"x\",\"phone\":\"033-000-0000\","
                + "\"x\":\"128.4900\",\"y\":\"38.1720\",\"distance\":\"250\",\"place_url\":\"http://place.map.kakao.com/12345\"},"
                + "{\"place_name\":\"시험펜션\",\"category_name\":\"여행 > 숙박 > 펜션\",\"road_address_name\":\"\",\"address_name\":\"강원특별자치도 속초시 설악동 1\",\"phone\":\"\","
                + "\"x\":\"128.5000\",\"y\":\"38.1800\",\"distance\":\"1200\",\"place_url\":\"http://evil.example/1\"},"
                + "{\"place_name\":\"나라밖\",\"x\":\"0.1\",\"y\":\"51.5\"}],\"meta\":{}}";
        com.google.gson.JsonArray kk = StaysServlet.kakaoStays(k);
        assertEquals("나라 밖 좌표는 뺌", 2, kk.size());
        JsonObject a = kk.get(0).getAsJsonObject();
        assertEquals("호텔", a.get("kind").getAsString());
        assertEquals("https://place.map.kakao.com/12345", a.get("url").getAsString());
        assertEquals(250, a.get("dist_m").getAsLong());
        JsonObject b = kk.get(1).getAsJsonObject();
        assertEquals("도로명이 비면 지번", "강원특별자치도 속초시 설악동 1", b.get("addr").getAsString());
        assertFalse("카카오맵 장소 주소가 아니면 넣지 않음", b.has("url"));
        assertFalse("빈 전화는 넣지 않음", b.has("tel"));
        assertNull("꼴이 틀리면 null", StaysServlet.kakaoStays("<html>"));
        assertTrue(StaysServlet.kakaoUrl(38.17, 128.49, 50000).contains("category_group_code=AD5&x=128.490000&y=38.170000&radius=20000&sort=distance"));

        String tour = "{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":{\"item\":["
                + "{\"title\":\"시험호텔설악(본관)\",\"contentid\":\"77\",\"firstimage\":\"http://tong.visitkorea.or.kr/cms/a.jpg\",\"firstimage2\":\"http://tong.visitkorea.or.kr/cms/b.jpg\",\"mapx\":\"128.4910\",\"mapy\":\"38.1721\",\"dist\":\"300\"},"
                + "{\"title\":\"관광공사만\",\"firstimage\":\"http://evil.example/x.jpg\",\"mapx\":\"128.55\",\"mapy\":\"38.19\",\"dist\":\"6500\"}]}}}}";
        com.google.gson.JsonArray ts = StaysServlet.body(tour).getAsJsonArray("stays");
        assertEquals("작은 사진 먼저, https", "https://tong.visitkorea.or.kr/cms/b.jpg", ts.get(0).getAsJsonObject().get("photo").getAsString());
        assertFalse("관광공사 사진 서버가 아니면 넣지 않음", ts.get(1).getAsJsonObject().has("photo"));

        JsonObject m = StaysServlet.merge(kk, ts);
        com.google.gson.JsonArray st = m.getAsJsonArray("stays");
        assertEquals("같은 곳(이름 앞이 같고 300m 안)은 하나로", 3, st.size());
        assertEquals("시험호텔 설악", st.get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("관광공사 사진 · contentid 를 붙임", "https://tong.visitkorea.or.kr/cms/b.jpg", st.get(0).getAsJsonObject().get("photo").getAsString());
        assertEquals("77", st.get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("가까운 순 - 관광공사만 있는 곳은 뒤", "관광공사만", st.get(2).getAsJsonObject().get("name").getAsString());
        assertEquals("카카오 · 한국관광공사", m.get("source").getAsString());
        assertEquals("시험호텔설악", StaysServlet.nameKey("시험호텔 설악(본관)"));
    }
}
