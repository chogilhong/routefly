package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.time.LocalDateTime;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 중기예보(2026-10-15). 칸 이름은 공공데이터포털 안내(wf4Am · rnSt4Am · taMin4 …), 값은 테스트 데이터. 실제 응답은 MidFcstProbe → resources/mid/. */
public class MidServletTest {

    @Test
    public void issueTime() {
        assertEquals("202610151800", MidServlet.tmFc(LocalDateTime.of(2026, 10, 15, 19, 0)));
        assertEquals("202610150600", MidServlet.tmFc(LocalDateTime.of(2026, 10, 15, 6, 0)));
        assertEquals("202610141800", MidServlet.tmFc(LocalDateTime.of(2026, 10, 15, 5, 59)));
        assertEquals("202612311800", MidServlet.tmFc(LocalDateTime.of(2027, 1, 1, 3, 0)));
    }

    @Test
    public void regionAndCity() {
        assertEquals("11H20000", MidServlet.landOf("경남"));
        assertEquals("11D20000", MidServlet.landOf("영동"));
        assertEquals("11B00000", MidServlet.landOf("경기북부"));
        assertNull(MidServlet.landOf(null));
        assertEquals("진주", MidServlet.city(35.80, 128.10, "11H20000")[1]);   // 가야산(합천) - 경남 안에서 가장 가까운 곳(대구가 더 가깝지만 경북)
        assertEquals("대구", MidServlet.city(35.80, 128.10, null)[1]);
    }

    @Test
    public void daysByKeyName() {
        String land = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":[{\"regId\":\"11H20000\","
                + "\"rnSt4Am\":20,\"rnSt4Pm\":30,\"wf4Am\":\"맑음\",\"wf4Pm\":\"구름많음\",\"rnSt8\":40,\"wf8\":\"흐리고 비\"}]}}}}";
        String ta = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":[{\"regId\":\"11H20701\","
                + "\"taMin4\":8,\"taMax4\":20,\"taMin8\":\"10\",\"taMax8\":\"18\"}]}}}}";
        JsonObject d = MidServlet.days(land, ta, "202610151800");
        assertEquals("{\"popAm\":20,\"popPm\":30,\"wfAm\":\"맑음\",\"wfPm\":\"구름많음\",\"tmn\":8,\"tmx\":20}", d.get("2026-10-19").toString());
        assertEquals("8일 뒤는 하루 한 값", "흐리고 비", d.getAsJsonObject("2026-10-23").get("wfPm").getAsString());
        assertEquals(40, d.getAsJsonObject("2026-10-23").get("popAm").getAsInt());
        assertNull(MidServlet.days("{\"response\":{\"header\":{\"resultCode\":\"03\"}}}", ta, "202610151800"));
    }
}
