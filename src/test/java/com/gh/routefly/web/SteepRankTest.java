package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 🧗 가파른 산 순위(SteepRank - 2026-10-18 홍TV님). */
public class SteepRankTest {

    private static JsonObject peak(String id, Integer elev) {
        JsonObject o = JsonParser.parseString("{\"id\":\"" + id + "\",\"name\":\"" + id.replaceAll("\\(.*", "") + "\",\"lat\":37,\"lon\":127}").getAsJsonObject();
        if (elev != null) o.addProperty("elev", elev);
        return o;
    }

    private static JsonObject course(String name, int dist, Integer asc, Double steep) {
        JsonObject c = new JsonObject();
        c.addProperty("name", name);
        c.addProperty("distance_m", dist);
        if (asc != null) c.addProperty("ascent_m", asc);
        if (steep != null) c.addProperty("steep_pct", steep);
        return c;
    }

    @Test
    public void 각도와_경사() {
        JsonArray peaks = new JsonArray();
        peaks.add(peak("가산", 1000));
        Map<String, List<JsonObject>> m = new HashMap<>();
        m.put("가산", List.of(course("A코스", 1000, 300, 45.5), course("B코스", 2000, 200, null)));
        SteepRank.Result r = SteepRank.rank(peaks, m);
        SteepRank.Row x = r.avg.get(0);
        double a = Math.toDegrees(Math.atan(0.3)), b = Math.toDegrees(Math.atan(0.1));
        assertEquals("각도 = atan(오르막 ÷ 거리)의 평균", (a + b) / 2, x.avgDeg, 1e-9);
        assertEquals(2, x.count);
        assertEquals("가장 가파른 코스", "A코스", x.course);
        assertEquals(16.7, x.deg, 0.05);
        assertEquals(45.5, x.steep1km, 1e-9);
        assertEquals("경사 % 는 각도의 tan", 30.0, SteepRank.pct(x.deg), 1e-9);
    }

    @Test
    public void 빼는_것() {
        JsonArray peaks = new JsonArray();
        peaks.add(peak("낮은산", 499));
        peaks.add(peak("높이없는산", null));
        peaks.add(peak("짧은산", 900));
        peaks.add(peak("코스없는산", 900));
        peaks.add(peak("된산", 500));
        Map<String, List<JsonObject>> m = new HashMap<>();
        m.put("낮은산", List.of(course("x", 1500, 400, null)));
        m.put("높이없는산", List.of(course("x", 1500, 400, null)));
        m.put("짧은산", List.of(course("999m", 999, 400, null), course("오르막 없음", 3000, null, null), course("0", 3000, 0, null)));
        m.put("된산", List.of(course("x", 1000, 100, null), course("짧음", 500, 400, null)));
        SteepRank.Result r = SteepRank.rank(peaks, m);
        assertEquals("500m 이상 · 1km 이상 · 오르막 있는 코스만", 1, r.avg.size());
        assertEquals("된산", r.avg.get(0).id);
        assertEquals(1, r.avg.get(0).count);
        assertNull("가파른 1km 가 없으면 null", r.avg.get(0).steep1km);
    }

    @Test
    public void 순서와_열개() {
        JsonArray peaks = new JsonArray();
        Map<String, List<JsonObject>> m = new HashMap<>();
        for (int i = 1; i <= 12; i++) {
            String id = "산" + i;
            peaks.add(peak(id, 600 + i));
            List<JsonObject> cs = new ArrayList<>();
            cs.add(course("완만" + i, 5000, 100 * i, null));   // 평균은 i 가 클수록 가파름
            if (i == 3) cs.add(course("절벽", 1000, 900, 60.0));   // 가장 가파른 코스는 산3(평균도 올라 1등)
            m.put(id, cs);
        }
        SteepRank.Result r = SteepRank.rank(peaks, m);
        assertEquals(10, r.avg.size());
        assertEquals(10, r.steepest.size());
        assertEquals("산3", r.avg.get(0).id);
        assertEquals("산12", r.avg.get(1).id);
        assertEquals("산3", r.steepest.get(0).id);
        assertEquals("절벽", r.steepest.get(0).course);
        for (int i = 1; i < 10; i++) {
            assertTrue(r.avg.get(i - 1).avgDeg >= r.avg.get(i).avgDeg);
            assertTrue(r.steepest.get(i - 1).deg >= r.steepest.get(i).deg);
        }
    }

    @Test
    public void 화면() {
        assertEquals("셈하기 전에는 칸이 없음", "", SteepRank.html(null, false));
        JsonArray peaks = new JsonArray();
        peaks.add(peak("백운산(정선)", 884));
        Map<String, List<JsonObject>> m = new HashMap<>();
        m.put("백운산(정선)", List.of(course("문희마을 → 정상 <a>", 1000, 300, 45.04)));
        String ko = SteepRank.html(SteepRank.rank(peaks, m), false);
        assertTrue(ko.contains("🧗 가파른 산 순위"));
        assertTrue(ko.contains("평균이 가장 가파른 산") && ko.contains("가장 가파른 코스를 가진 산"));
        assertTrue("산 페이지 링크", ko.contains("href=\"../m/" + MountainServlet.enc("백운산(정선)") + "\">백운산(정선)</a>"));
        assertTrue("높이 · 코스 수", ko.contains("884m · 코스 1"));
        assertTrue("가장 가파른 코스는 이름 아래", ko.contains("가장 가파른 문희마을 → 정상 &lt;a&gt; 16.7°</small>"));
        assertTrue("각도 · 경사 · 가파른 1km", ko.contains(">16.7°<") && ko.contains(">30.0%<") && ko.contains(">45.0%<"));
        assertTrue("이름은 이스케이프", ko.contains("&lt;a&gt;") && !ko.contains("<a>"));
        String en = SteepRank.html(SteepRank.rank(peaks, m), true);
        assertTrue(en.contains("🧗 Steepest mountains") && en.contains("Steepest 1 km"));
        assertTrue("영어 이름 · slug 링크", en.contains("href=\"" + Roman.slug("백운산(정선)") + "\">" + MountainEn.name(peaks.get(0).getAsJsonObject()) + "</a>"));
        assertTrue(en.contains("884m · 1 trail"));
        assertFalse("영어판에 한국어 설명 없음", en.contains("정상 해발"));
        assertTrue("목록에 끼움", MountainServlet.indexPage(peaks, new JsonArray(), "", false, ko).contains(ko + "<section><h2>⚠ 산행 안전 팁"));
        assertTrue(MountainEn.indexPage(peaks, new JsonArray(), "", en).contains(en));
    }
}
