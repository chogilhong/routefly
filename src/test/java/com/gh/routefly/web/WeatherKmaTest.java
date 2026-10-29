package com.gh.routefly.web;

import static org.junit.Assert.*;

import com.google.gson.JsonObject;
import org.junit.Test;

/** 기상청 날씨누리처럼(2026-10-30 홍TV님 "참고해") - 풍향(VEC) · 날씨누리 링크용 행정동. 응답은 그 모양으로 만든 테스트 데이터. */
public class WeatherKmaTest {

    @Test
    public void vecKept() {
        String t = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":["
                + "{\"fcstDate\":\"20261030\",\"fcstTime\":\"0600\",\"category\":\"VEC\",\"fcstValue\":\"315\"},"
                + "{\"fcstDate\":\"20261030\",\"fcstTime\":\"0600\",\"category\":\"WSD\",\"fcstValue\":\"2.1\"}]}}}}";
        JsonObject h = WeatherServlet.body(t, new String[] {"20261030", "0500"}).getAsJsonArray("hours").get(0).getAsJsonObject();
        assertEquals("풍향(불어오는 쪽, 도)", 315, h.get("vec").getAsInt());
        assertEquals(2.1, h.get("wsd").getAsDouble(), 1e-9);
    }

    @Test
    public void regionPicksAdministrativeDong() {
        String k = "{\"meta\":{\"total_count\":2},\"documents\":["
                + "{\"region_type\":\"B\",\"code\":\"1111010100\",\"address_name\":\"시험시 시험구 법정동\"},"
                + "{\"region_type\":\"H\",\"code\":\"1111051500\",\"address_name\":\"시험시 시험구 시험1동\"}]}";
        JsonObject r = WxServlet.parseRegion(k);
        assertEquals("행정동(H) 번호", "1111051500", r.get("code").getAsString());
        assertEquals("시험시 시험구 시험1동", r.get("name").getAsString());
        assertNull("행정동이 없으면 null", WxServlet.parseRegion("{\"documents\":[{\"region_type\":\"B\",\"code\":\"1111010100\",\"address_name\":\"a\"}]}"));
        assertNull("번호가 10자리 숫자가 아니면 null", WxServlet.parseRegion("{\"documents\":[{\"region_type\":\"H\",\"code\":\"12<x>\",\"address_name\":\"a\"}]}"));
        assertNull("꼴이 틀리면 null", WxServlet.parseRegion("<html>"));
        assertFalse("행정동은 날씨 셋의 성패와 상관없음", WxServlet.partial(partialOk()));
    }

    private static JsonObject partialOk() {
        JsonObject o = new JsonObject();
        for (String k : new String[] {"weather", "mid", "air"}) o.add(k, new JsonObject());
        return o;
    }
}
