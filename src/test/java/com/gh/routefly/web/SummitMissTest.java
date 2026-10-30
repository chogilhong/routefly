package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 이름에 정상이 있는데 선이 그 정상에 안 가는 코스 - "정상 미포함"(2026-10-30 코스 점검 38개). 좌표는 시험용. */
public class SummitMissTest {

    private static String name(String n, double[] lat, double[] lon, List<Peaks.Top> t) {
        Peaks.Miss m = Peaks.miss(n, lat, lon, t);
        return m == null ? null : m.name();
    }

    private static final JsonArray PEAKS = JsonParser.parseString("["
            + "{\"id\":\"강천산\",\"name\":\"강천산\",\"summit\":\"강천산 왕자봉\",\"lat\":35.40,\"lon\":127.05},"
            + "{\"id\":\"명성산\",\"name\":\"명성산\",\"summit\":\"명성산\",\"lat\":38.090,\"lon\":127.3376,\"alt\":[{\"name\":\"명성산\",\"lat\":38.104,\"lon\":127.3379}]},"
            + "{\"id\":\"대암산\",\"name\":\"대암산\",\"summit\":\"대암산\",\"lat\":38.2,\"lon\":128.1,\"closed\":\"통제\"}]").getAsJsonArray();

    @Test
    public void names() {
        List<Peaks.Top> t = Peaks.named(PEAKS);
        assertEquals("통제 정상 빼고 alt 더함", 3, t.size());
        assertEquals("왕자봉", Peaks.core(t.get(0)));
        assertEquals("산 이름이 붙은 정상", 1, Peaks.namedTops("강천산 왕자봉 · 강천산왕자봉 → 연대봉", t, 35.41, 127.05).size());
        assertEquals("정상 이름만", 1, Peaks.namedTops("강천산 · 관광안내소 → 왕자봉", t, 35.41, 127.05).size());
        assertEquals("무리 이름(· 앞)에만 있으면 아님", 0, Peaks.namedTops("강천산 왕자봉 · 관광안내소 → 연대봉", t, 35.41, 127.05).size());
        assertEquals("15km 밖 같은 이름", 0, Peaks.namedTops("x · 왕자봉", t, 36.0, 127.05).size());
    }

    @Test
    public void miss() {
        List<Peaks.Top> t = Peaks.named(PEAKS);
        assertEquals("정상에서 1km 떨어져 끝남", "왕자봉", name("x · 입구 → 왕자봉", new double[] {35.38, 35.391}, new double[] {127.05, 127.05}, t));
        assertNull("점 사이 선분이 정상 옆을 지남", name("x · 입구 → 왕자봉 → 연대봉", new double[] {35.39, 35.41}, new double[] {127.0505, 127.0505}, t));
        assertNull("두 번째 정상(alt)에 가면 통과", name("x · 약사령 → 명성산", new double[] {38.11, 38.1041}, new double[] {127.33, 127.3379}, t));
        assertNull("이름에 정상 없음", name("x · 입구 → 연대봉", new double[] {35.38}, new double[] {127.05}, t));
        JsonObject d = JsonParser.parseString("{\"course\":{\"name\":\"x · 입구 → 왕자봉\"},\"points\":[[127.05,35.38,0,0],[127.05,35.391,0,1200]]}").getAsJsonObject();
        Peaks.markMiss(d, t);
        assertEquals("왕자봉", d.getAsJsonObject("course").get("summit_miss").getAsString());
    }

    @Test
    public void farMissDropped() {
        List<Peaks.Top> t = Peaks.named(PEAKS);
        Peaks.Miss m = Peaks.miss("x · 입구 → 왕자봉", new double[] {35.38, 35.391}, new double[] {127.05, 127.05}, t);
        assertEquals("왕자봉", m.name());
        assertEquals("선 끝(35.391)에서 정상(35.40)까지 약 1km", 1000, m.m(), 30);
        JsonArray rows = JsonParser.parseString("[{\"course_id\":\"a\",\"summit_miss_m\":1643},{\"course_id\":\"b\",\"summit_miss_m\":231},{\"course_id\":\"c\"}]").getAsJsonArray();
        assertEquals(1, Steep.dropFarMiss(rows));
        assertEquals("1km 넘는 것만 뺌", "b", rows.get(0).getAsJsonObject().get("course_id").getAsString());
        assertEquals(2, rows.size());
    }
}
