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
        assertEquals("전체(2026-10-18 홍TV님)", 12, r.avg.size());
        assertEquals(12, r.steepest.size());
        String h = SteepRank.html(r, false);
        assertTrue("10위 뒤에 접은 줄", h.contains("<details class=\"stMore\"><summary>11위 ~ 12위 보기</summary></details></td></tr></tbody><tbody class=\"stRest\"><tr><td class=\"rk\">11</td>"));
        assertTrue(h.contains("<span class=\"fs\">전체 12곳</span>"));
        assertTrue(SteepRank.html(r, true).contains("Show #11–12"));
        assertEquals("산3", r.avg.get(0).id);
        assertEquals("산12", r.avg.get(1).id);
        assertEquals("산3", r.steepest.get(0).id);
        assertEquals("절벽", r.steepest.get(0).course);
        for (int i = 1; i < 12; i++) {
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
        assertTrue("산 페이지 링크(어느 표에서 왔는지)", ko.contains("href=\"../m/" + MountainServlet.enc("백운산(정선)") + "?from=steep1\">백운산(정선)</a>")
                && ko.contains("?from=steep2\">백운산(정선)</a>"));
        assertTrue("처음엔 모두 접힘 · 표마다 접는 칸(하나를 펴면 다른 하나는 접힘)", ko.contains("<details class=\"fold kind\" name=\"kind\"><summary>")
                && ko.split("<details class=\"fold group stF\" name=\"steepT\"><summary>", -1).length == 3 && !ko.contains(" open>"));
        String back = SteepRank.html(SteepRank.rank(peaks, m), false, SteepRank.openOf("steep2"));
        assertTrue("‹ 코스 모음으로 돌아오면 그 표만 펼침", back.contains("name=\"kind\" open>") && back.contains("name=\"steepT\" open><summary><span class=\"ft\">가장 가파른 코스를 가진 산")
                && back.contains("name=\"steepT\"><summary><span class=\"ft\">평균이"));
        assertEquals(0, SteepRank.openOf("peaks"));
        assertEquals(0, SteepRank.openOf(null));
        assertTrue("높이 · 코스 수", ko.contains("884m · 코스 1"));
        assertTrue("가장 가파른 코스는 이름 아래", ko.contains("가장 가파른 문희마을 → 정상 &lt;a&gt; 16.7°</small>"));
        assertTrue("각도 · 경사 · 가파른 1km", ko.contains("<b>16.7°</b><small>경사 30.0%</small><small class=\"s1\">가파른 1km 45.0%</small>"));
        assertTrue("이름은 이스케이프", ko.contains("&lt;a&gt;") && !ko.contains("<a>"));
        String en = SteepRank.html(SteepRank.rank(peaks, m), true);
        assertTrue(en.contains("🧗 Steepest mountains") && en.contains("<small>grade 30.0%</small><small class=\"s1\">steepest 1 km 45.0%</small>"));
        assertFalse("3칸 - 수치는 한 칸에(360px · 가++ · 영어에서 잘렸음)", ko.contains("<th class=\"n\">경사") || en.contains("<th class=\"n\">Grade"));
        assertTrue("영어 이름 · slug 링크", en.contains("href=\"" + Roman.slug("백운산(정선)") + "?from=steep1\">" + MountainEn.name(peaks.get(0).getAsJsonObject()) + "</a>"));
        assertTrue(en.contains("884m · 1 trail"));
        assertFalse("영어판에 한국어 설명 없음", en.contains("정상 해발"));
        assertTrue("목록에 끼움", MountainServlet.indexPage(peaks, new JsonArray(), "", false, ko).contains(ko + "<section><h2>⚠ 산행 안전 팁"));
        assertTrue(MountainEn.indexPage(peaks, new JsonArray(), "", en).contains(en));
    }

    @Test
    public void 코스_줄도_같은_기준() {   // 2026-10-18 홍TV님 "통일" - 산 페이지 코스 줄 · 순위가 같은 글
        assertEquals(" · 각도 16.7° · 경사 30.0% · 가파른 1km 45.0%", SteepRank.slopeText(1000, 300, 45.04, false));
        assertEquals(" · angle 16.7° · grade 30.0% · steepest 1 km 45.0%", SteepRank.slopeText(1000, 300, 45.04, true));
        assertEquals("1km 아래 · 오르막 없음은 각도 없이", " · 가파른 1km 40.0%", SteepRank.slopeText(999, 300, 40.0, false));
        assertEquals("", SteepRank.slopeText(3000, null, null, false));
        assertEquals("", SteepRank.slopeText(3000, 0, null, false));
        JsonObject p = peak("가산", 900);
        JsonObject c = course("A코스", 2180, 485, 41.0);
        c.addProperty("course_id", "x-1");
        String ko = MountainServlet.page(p, List.of(c), new ArrayList<>(), null, ""), en = MountainEn.page(p, List.of(c), new ArrayList<>(), null, "");
        assertTrue("산 페이지 코스 줄", ko.contains("2.18km · 오르막 485m · 각도 12.5° · 경사 22.2% · 가파른 1km 41.0% · 약 "));
        assertTrue(en.contains("2.18 km · 485 m ascent · angle 12.5° · grade 22.2% · steepest 1 km 41.0% · about "));
        assertTrue("난이도도 어려움", ko.contains("<i class=\"lv lv3\">어려움</i>"));
    }
}
