package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * 2026-10-21: 에어코리아 하루 한도(429 LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR)를 넘긴 뒤에도 13ms 마다 다시 물어 서버 로그 7,373줄.
 * 모든 공공 API 에 같은 차단기 - 한도 초과는 우리 시간 자정까지, 연달아 실패하면 5 · 15분 쉼.
 */
public class OpenApiLimitTest {

    @Test
    public void limitHitIsRecognized() {
        assertTrue(OpenApi.limitHit(429, "anything"));
        assertTrue("200 이어도 본문이 한도 초과", OpenApi.limitHit(200, "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>"
                + "<returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"));
        assertTrue("JSON 꼴 코드 22", OpenApi.limitHit(200, "{\"returnReasonCode\":\"22\"}"));
        assertFalse("다른 오류 코드", OpenApi.limitHit(200, "<returnReasonCode>30</returnReasonCode>"));
        assertFalse("223 같은 숫자는 아님", OpenApi.limitHit(200, "<returnReasonCode>223</returnReasonCode>"));
        assertFalse("정상 자료", OpenApi.limitHit(200, "{\"response\":{\"body\":{\"items\":[]}}}"));
        assertFalse(OpenApi.limitHit(503, "SERVICE TIMEOUT"));
    }

    @Test
    public void restAndMidnight() {
        assertEquals("한 번은 안 쉼", 0, OpenApi.restMs(1));
        assertEquals(5 * 60_000L, OpenApi.restMs(2));
        assertEquals(15 * 60_000L, OpenApi.restMs(5));
        long t = java.time.ZonedDateTime.of(2026, 10, 21, 18, 31, 0, 0, java.time.ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        long m = java.time.ZonedDateTime.of(2026, 10, 22, 0, 0, 0, 0, java.time.ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        assertEquals("우리 시간 자정까지", m, OpenApi.kstMidnightAfter(t));
    }
}
