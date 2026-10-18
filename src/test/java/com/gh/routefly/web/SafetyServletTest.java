package com.gh.routefly.web;

import static org.junit.Assert.*;
import java.time.LocalDateTime;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

/** 🛟 오늘의 산행 안전(2026-10-18) - PC 가 SafetyApiProbe 로 받은 실제 응답(src/test/resources/safety, abdc17e)으로. */
public class SafetyServletTest {

    private static String res(String name) throws java.io.IOException {
        return new String(SafetyServletTest.class.getResourceAsStream(name).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test
    public void realResponses() throws Exception {
        JsonArray er = SafetyServlet.er(res("/safety/er-near.xml"));
        assertTrue(er.size() >= 2);
        // 실제 응답 5곳 중 서울대학교치과병원(치과병원)은 뺌(2026-10-18) - 산행 부상에 맞지 않음
        assertEquals(4, er.size());
        for (int i = 0; i < er.size(); i++) assertFalse(er.get(i).getAsJsonObject().get("name").getAsString().contains("치과"));
        assertEquals("서울대학교병원", er.get(3).getAsJsonObject().get("name").getAsString());
        JsonObject e0 = er.get(0).getAsJsonObject();
        assertEquals("강북삼성병원", e0.get("name").getAsString());
        assertEquals(0.91, e0.get("km").getAsDouble(), 1e-9);
        assertEquals("02-2001-2001", e0.get("tel").getAsString());
        assertEquals("서울특별시", SafetyServlet.sido(e0.get("addr").getAsString()));

        JsonArray fires = SafetyServlet.fire(res("/safety/fire-sido.json"));
        assertEquals(16, fires.size());
        JsonObject seoul = SafetyServlet.pickFire(fires, "서울특별시");
        assertEquals("11", seoul.get("code").getAsString());
        assertEquals(0, seoul.get("level").getAsInt());
        assertEquals("2026-10-18 17", seoul.get("date").getAsString());
        assertEquals("대구 d2 8% → 다소높음", 1, SafetyServlet.pickFire(fires, "대구광역시").get("level").getAsInt());
        assertEquals("광주 주소 → 전남광주통합특별시", "12", SafetyServlet.pickFire(fires, "광주광역시").get("code").getAsString());
        assertEquals("12", SafetyServlet.pickFire(fires, "전라남도").get("code").getAsString());
        assertEquals("51", SafetyServlet.pickFire(fires, "강원특별자치도").get("code").getAsString());
        assertEquals("52", SafetyServlet.pickFire(fires, "전라북도").get("code").getAsString());
        assertNull(SafetyServlet.pickFire(fires, "평양"));

        JsonObject uv = SafetyServlet.uv(res("/safety/uv.json"));
        assertEquals("2026101818", uv.get("date").getAsString());
        assertEquals(26, uv.getAsJsonArray("hours").size());
        assertEquals(5, uv.getAsJsonArray("hours").get(6).getAsJsonObject().get("v").getAsInt());   // h18

        JsonObject w = SafetyServlet.warn(res("/safety/warn-status.json"));
        assertEquals("202610181830", w.get("tm").getAsString());
        JsonArray lines = w.getAsJsonArray("lines");
        assertEquals(3, lines.size());
        assertEquals("강풍주의보", lines.get(0).getAsJsonObject().get("type").getAsString());
        JsonObject gw = SafetyServlet.mark(w, "강원특별자치도"), jb = SafetyServlet.mark(w, "전북특별자치도"), sl = SafetyServlet.mark(w, "서울특별시"), jn = SafetyServlet.mark(w, "전라남도");
        assertTrue("강원 → 강풍", gw.getAsJsonArray("lines").get(0).getAsJsonObject().get("mine").getAsBoolean());
        assertFalse(gw.getAsJsonArray("lines").get(2).getAsJsonObject().get("mine").getAsBoolean());
        assertTrue("전북자치도 → 호우", jb.getAsJsonArray("lines").get(2).getAsJsonObject().get("mine").getAsBoolean());
        assertFalse("서울은 없음", sl.getAsJsonArray("lines").get(0).getAsJsonObject().get("mine").getAsBoolean());
        assertTrue("전라남도 → 호우", jn.getAsJsonArray("lines").get(2).getAsJsonObject().get("mine").getAsBoolean());
    }

    @Test
    public void edges() {
        assertNull(SafetyServlet.er("<response><header><resultCode>30</resultCode></header></response>"));
        assertNull(SafetyServlet.fire("{}"));
        assertNull(SafetyServlet.uv("<xml>"));
        assertEquals(0, SafetyServlet.warn("{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":{\"tmFc\":1,\"t6\":\"\"}}}}}").getAsJsonArray("lines").size());
        assertEquals("2026101806", SafetyServlet.uvTime(LocalDateTime.of(2026, 10, 18, 12, 0))[0]);
        assertEquals("2026101718", SafetyServlet.uvTime(LocalDateTime.of(2026, 10, 18, 6, 5))[0]);
        assertEquals("2026101818", SafetyServlet.uvTime(LocalDateTime.of(2026, 10, 18, 23, 0))[0]);
        assertEquals("경북", SafetyServlet.shortSido("경상북도"));
        assertNull(SafetyServlet.sido(null));
        assertNotNull(JsonParser.parseString("{}"));
    }
}
