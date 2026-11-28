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
    public void 화면() throws Exception {
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
        // 2026-11-27 홍TV님 "이 둘의 위치를 바꾸자" - 등산 칸 안(100대 명산 아래 · 출조 줄 위)에 한 칸으로, 전에는 목록 아래 따로(지금 그 자리는 ▶ 산에서 궁금한 것)
        String idxK = MountainServlet.indexPage(peaks, new JsonArray(), "", false, ko, "", new com.google.gson.JsonArray()), grp = ko.replace("<details class=\"fold kind\" name=\"kind\"", "<details class=\"fold group\" name=\"group\"");
        assertTrue("등산 칸 안에 끼움", idxK.contains("</ul></details>" + grp + "</div></details>") && idxK.indexOf(grp) < idxK.indexOf("class=\"kindLink\""));
        String css = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/css/mountain.css")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("두 표는 들여 쓰고 └ 표시(2026-11-27 홍TV님 \"하위에 있다는 것을 보여줘\")", css.contains(".fold.kind #steep > .fold > .fb { margin-left:8px; padding-left:10px;") && css.contains(".fold.kind #steep .stF > summary .ft::before { content:\"└ \";"));
        assertFalse("목록 아래에는 없음", idxK.contains("<section id=\"weekend\" hidden></section><section id=\"steep\">"));
        String backIdx = MountainServlet.indexPage(peaks, new JsonArray(), "", false, SteepRank.html(SteepRank.rank(peaks, m), false, 2), "", new com.google.gson.JsonArray());
        assertTrue("‹ 코스 모음으로 돌아오면 등산 칸도 펴짐", backIdx.contains("<details class=\"fold kind\" name=\"kind\" open><summary><span class=\"ft\">⛰️ 등산") && backIdx.contains("<details class=\"fold group\" name=\"group\" open><summary><span class=\"ft\">🧗"));
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
        String ko = MountainServlet.page(p, List.of(c), new ArrayList<>(), null, "", java.time.LocalDate.now(WeatherServlet.KST).getMonthValue()), en = MountainEn.page(p, List.of(c), new ArrayList<>(), null, "");
        // 2026-11-21 홍TV님 "고급지게" 2번 - 산 페이지 코스 줄은 거리 · 오르막 · 시간만, 각도 · 경사는 코스 페이지(/c/ - CoursePageServlet 난이도 칸이 slopeText)로
        assertTrue("산 페이지 코스 줄", ko.contains("2.18km · 오르막 485m · 약 ") && !ko.contains("각도 12.5°"));
        assertTrue(en.contains("2.18 km · 485 m ascent · about ") && !en.contains("angle 12.5°"));
        assertTrue("난이도도 어려움", ko.contains("<i class=\"lv lv3\">어려움</i>"));
    }

    /** 2026-11-28 홍TV님 "고정된 데이터인데 뭐하러 매번 새로 세지?" - 순위를 파일에 남겨 톰캣을 다시 띄우면 읽기만. */
    @Test
    public void 파일에_남기고_다시_읽기() {
        JsonArray peaks = new JsonArray();
        peaks.add(peak("가산", 1000));
        peaks.add(peak("나산", 800));
        Map<String, List<JsonObject>> m = new HashMap<>();
        m.put("가산", List.of(course("A코스", 1000, 500, 45.5), course("B코스", 5000, 100, null)));   // 평균은 낮고(약 13.9°) 가장 가파른 코스는 높음(26.6°)
        m.put("나산", List.of(course("C코스", 1000, 280, null)));   // 15.6°
        SteepRank.Result r = SteepRank.rank(peaks, m);
        String json = SteepRank.toJson(r, 1764300000000L);
        SteepRank.Saved sv = SteepRank.fromJson(json);
        assertEquals("셈한 시각", 1764300000000L, sv.at);
        assertEquals("다시 읽은 순위로 만든 화면이 셈한 것과 같음(한 · 영)", SteepRank.html(r, false, 1), SteepRank.html(sv.result, false, 1));
        assertEquals(SteepRank.html(r, true, 2), SteepRank.html(sv.result, true, 2));
        assertEquals("평균 순서와 코스 순서가 다름 - 둘 다 그대로", "나산", sv.result.avg.get(0).id);
        assertEquals("가산", sv.result.avg.get(1).id);
        assertEquals("가산", sv.result.steepest.get(0).id);
        assertNull("가파른 1km 가 없던 산은 null 그대로", sv.result.avg.get(0).steep1km);
        assertEquals(45.5, sv.result.avg.get(1).steep1km, 1e-9);
        assertNull("깨진 파일은 null(다시 셈)", SteepRank.fromJson("{\"at\":1,"));
        assertNull("모양이 다른 파일", SteepRank.fromJson("{\"at\":1,\"avg\":[],\"steepest\":[\"없는산\"]}"));
        assertTrue("통계와 같은 폴더(운영에서 톰캣이 쓸 수 있는 stats.dir)", MountainServlet.steepFile().equals(Stats.file().resolveSibling("steep-rank.json")));
    }

    /** 2026-11-28 홍TV님 "가파른 산 코스를 가진 산이면 그 코스가 뭔지 알려줘야" - 순위 링크에 코스 id, 산 페이지는 그 코스를 맨 위로 · 표시. */
    @Test
    public void 순위의_코스를_산_페이지에서_표시() throws Exception {
        JsonArray peaks = new JsonArray();
        peaks.add(peak("내장산", 764));
        JsonObject a = course("내장산 · 신선봉코스", 1000, 412, 41.4), b = course("내장산 · 완만", 5000, 300, null);
        a.addProperty("course_id", "c-77");
        b.addProperty("course_id", "c-78");
        Map<String, List<JsonObject>> m = new HashMap<>();
        m.put("내장산", List.of(b, a));
        SteepRank.Result r = SteepRank.rank(peaks, m);
        assertEquals("가장 가파른 코스 id", "c-77", r.steepest.get(0).courseId);
        String ko = SteepRank.html(r, false, 2), en = SteepRank.html(r, true, 2);
        String hk = "../m/" + MountainServlet.enc("내장산") + "?from=steep2&amp;c=c-77#trails";
        assertTrue("산 이름 링크에 코스 id · #trails(접힌 코스 칸을 폄)", ko.contains("href=\"" + hk + "\">내장산</a>"));
        assertTrue("코스 이름도 같은 곳으로", ko.contains("href=\"" + hk + "\">내장산 · 신선봉코스</a>"));
        assertTrue("평균 표도 그 코스로", ko.contains("?from=steep1&amp;c=c-77#trails"));
        assertTrue("영어도", en.contains(Roman.slug("내장산") + "?from=steep2&amp;c=c-77#trails"));
        SteepRank.Saved sv = SteepRank.fromJson(SteepRank.toJson(r, 1L));
        assertEquals("파일에도 코스 id", "c-77", sv.result.steepest.get(0).courseId);
        assertNull("옛 모양 파일(코스 id 칸 전)은 읽지 않고 다시 셈", SteepRank.fromJson(SteepRank.toJson(r, 1L).replace("\"v\":" + SteepRank.FILE_V + ",", "")));
        for (String f : new String[] {"mountain.js", "mountain-en.js"}) {
            String js = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/js/" + f)), java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(f + " - ?c= 코스를 맨 위로 · 표시", js.contains("stList.insertBefore(stLi, stList.firstChild)") && js.contains("stLi.classList.add(\"stHi\")")
                    && js.contains("[?&]c=([^&#]+)") && js.contains("stTag"));
        }
        String css = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/css/mountain.css")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("표시 모양", css.contains(".cs li.stHi {") && css.contains(".stTag {"));
    }
}
