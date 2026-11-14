package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 기상청 날씨누리 단풍 · 철쭉 관측(공공데이터 15150373) → 산 페이지 · 코스 모음 칸(2026-11-14). 값은 src/test/resources/season/ 의 실제 파일. */
public class SeasonTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonArray peaks() throws Exception {
        return JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
    }

    private static JsonArray seasoned() throws Exception {
        JsonArray p = peaks();
        MountainServlet.withSeason(p, JsonParser.parseString(read("src/main/webapp/data/season.json")).getAsJsonObject());
        return p;
    }

    private static JsonObject peak(JsonArray all, String id) {
        return MountainServlet.find(all, id);
    }

    private static JsonObject season() throws Exception {
        return JsonParser.parseString(read("src/main/webapp/data/season.json")).getAsJsonObject();
    }

    private static final String BASE = "https://routefly.kr/routefly";

    @Test
    public void committedJsonIsRebuiltFromRealFile() throws Exception {
        JsonObject built = SeasonProbe.build(read(SeasonProbe.CSV.toString()), peaks());
        assertEquals("season.json 은 SeasonProbe 로 다시 만든 것과 같아야 함", SeasonProbe.json(built), read("src/main/webapp/data/season.json"));
        assertEquals("단풍 21곳(포털 설명)", 21, built.getAsJsonObject("foliage").size());
        assertEquals("철쭉 3곳", 3, built.getAsJsonObject("azalea").size());
        assertEquals("벚꽃 13곳", 13, built.getAsJsonObject("cherry").size());
        assertEquals("2025-10-23", built.getAsJsonObject("foliage").getAsJsonObject("가야산").get("start").getAsString());
        assertEquals("2025-11-05", built.getAsJsonObject("foliage").getAsJsonObject("가야산").get("peak").getAsString());
        assertEquals("2026-05-29", built.getAsJsonObject("azalea").getAsJsonObject("소백산").get("peak").getAsString());
        assertEquals("벚꽃은 공주 계룡산만 산과 이어짐", "계룡산", built.getAsJsonObject("cherry").getAsJsonObject("공주 계룡산").get("mountain").getAsString());
        assertEquals("2026-04-03", built.getAsJsonObject("cherry").getAsJsonObject("공주 계룡산").get("peak").getAsString());
        assertFalse(built.getAsJsonObject("cherry").getAsJsonObject("여의도 윤중로").has("mountain"));
        assertFalse("지리산(통영)에 지리산 관측을 붙이지 않음", built.getAsJsonObject("foliage").has("지리산(통영)"));
    }

    @Test
    public void csvKeepsQuotedNewlines() {
        List<List<String>> r = SeasonProbe.csv("\uFEFFa,b\r\n1,\"x\ny, \"\"z\"\"\"\r\n");
        assertEquals(2, r.size());
        assertEquals("x\ny, \"z\"", r.get(1).get(1));
        assertNull(SeasonProbe.day("결측"));
        assertEquals("2025-11-05", SeasonProbe.day(" 2025-11-05 15:48"));
    }

    @Test
    public void mountainPageShowsLastObservation() throws Exception {
        JsonArray all = seasoned();
        String html = MountainServlet.page(peak(all, "가야산"), new ArrayList<>(), new ArrayList<>(), null, BASE, 1);
        assertTrue(html.contains("<section class=\"season\"><h2>가야산 단풍 시기</h2>"));
        assertTrue(html.contains("🍁 단풍 시작 2025년 10월 23일 · 절정 11월 5일</li>"));
        assertTrue("예측이 아니라고 밝힘", html.contains("올해 예측이 아님"));
        assertTrue("출처", html.contains("기상청 날씨누리"));
        assertTrue("자주 묻는 질문", html.contains("<dt>가야산 단풍 절정은 언제인가요?</dt>"));

        String sb = MountainServlet.page(peak(all, "소백산"), new ArrayList<>(), new ArrayList<>(), null, BASE, 1);
        assertTrue(sb.contains("<h2>소백산 철쭉 · 단풍 시기</h2>"));
        assertTrue(sb.contains("🌺 철쭉 꽃 핌 2026년 5월 20일 · 활짝 5월 29일"));
        assertTrue(sb.contains("<dt>소백산 철쭉은 언제 피나요?</dt>"));

        String gr = MountainServlet.page(peak(all, "계룡산"), new ArrayList<>(), new ArrayList<>(), null, BASE, 1);
        assertTrue(gr.contains("<h2>계룡산 벚꽃 · 단풍 시기</h2>"));
        assertTrue(gr.contains("🌸 벚꽃 꽃 핌 2026년 3월 31일 · 활짝 4월 3일"));
        assertTrue(gr.contains("<dt>계룡산 벚꽃은 언제 피나요?</dt>"));

        String none = MountainServlet.page(peak(all, "가리산"), new ArrayList<>(), new ArrayList<>(), null, BASE, 10);
        assertFalse("관측 없는 산은 칸 없음", none.contains("class=\"season\""));
        assertFalse(none.contains("단풍 절정은"));
    }

    @Test
    public void inSeasonTheBlockMovesUp() throws Exception {
        JsonObject g = peak(seasoned(), "가야산");
        String jan = MountainServlet.page(g, new ArrayList<>(), new ArrayList<>(), null, BASE, 1);
        String oct = MountainServlet.page(g, new ArrayList<>(), new ArrayList<>(), null, BASE, 10);
        assertFalse("철이 아니면 지금 철 표시 없음", jan.contains("지금 철"));
        assertTrue("철이 아니면 날씨 칸 아래", jan.indexOf("class=\"season\"") > jan.indexOf("id=\"wx\""));
        assertTrue(oct.contains("절정 11월 5일 <b class=\"now\">지금 철</b>"));
        assertTrue("단풍철(10월)에는 날씨 칸 위로", oct.indexOf("class=\"season\"") < oct.indexOf("id=\"wx\""));
        assertEquals("칸은 한 번만", oct.indexOf("class=\"season\""), oct.lastIndexOf("class=\"season\""));
        assertEquals(jan.indexOf("class=\"season\""), jan.lastIndexOf("class=\"season\""));
    }

    @Test
    public void indexShowsOnlyWhatIsInSeason() throws Exception {
        JsonArray all = seasoned();
        JsonObject sea = season();
        String nov = MountainServlet.seasonFold(all, sea, 11);
        assertTrue(nov.contains("<span class=\"ft\">🍁 단풍 때</span>"));
        assertTrue(nov.contains("🍁 단풍 절정 차례 <small>(2025년 관측)</small>"));
        assertTrue("가장 이른 오대산이 설악산보다 앞", nov.indexOf("오대산 <small>10월 16일") < nov.indexOf("설악산 <small>10월 24일"));
        assertTrue(nov.indexOf("설악산 <small>") < nov.indexOf("내장산 <small>11월 11일"));
        assertFalse("11월에 벚꽃 · 철쭉 없음", nov.contains("벚꽃") || nov.contains("철쭉"));

        String apr = MountainServlet.seasonFold(all, sea, 4);
        assertTrue("4월은 벚꽃 · 철쭉 둘 다", apr.contains("<span class=\"ft\">🌸 벚꽃 · 🌺 철쭉 때</span>"));
        assertTrue("진해가 가장 이름", apr.indexOf("진해 여좌천 <small>3월 30일") < apr.indexOf("여의도 윤중로 <small>4월 1일"));
        assertTrue("산과 이어지는 벚꽃은 산 페이지로", apr.contains("<a href=\"../m/%EA%B3%84%EB%A3%A1%EC%82%B0\">공주 계룡산 <small>4월 3일</small></a>"));
        assertTrue("도시는 글만", apr.contains("<span>여의도 윤중로 <small>4월 1일</small></span>"));
        assertTrue(apr.contains("지리산 <small>4월 29일"));
        assertFalse(apr.contains("단풍"));

        assertEquals("1월 · 7월은 칸 없음", "", MountainServlet.seasonFold(all, sea, 1));
        assertEquals("", MountainServlet.seasonFold(all, sea, 7));

        String idx = MountainServlet.indexPage(all, new JsonArray(), BASE, false, "", nov);
        assertTrue("검색칸 아래 · 내 근처 위", idx.indexOf("<section id=\"season\">") > idx.indexOf("class=\"mSearch\"") && idx.indexOf("<section id=\"season\">") < idx.indexOf("<section id=\"near\">"));
        assertFalse(MountainServlet.indexPage(all, new JsonArray(), BASE, false).contains("id=\"season\""));

        JsonArray bare = peaks();
        assertEquals("season.json 이 없으면 칸도 없음", "", MountainServlet.seasonFold(bare, new JsonObject(), 10));
        assertEquals("", MountainServlet.seasonBlock(peak(bare, "가야산"), "가야산", 10));
    }

    @Test
    public void badDatesAreDropped() throws Exception {
        JsonArray p = peaks();
        MountainServlet.withSeason(p, JsonParser.parseString("{\"foliage\":{\"가야산\":{\"start\":\"10월\",\"peak\":\"2025-11-05\"}},"
                + "\"cherry\":{\"여의도 윤중로\":{\"peak\":\"2026-04-01\"},\"가야산\":{\"peak\":\"2026-04-01\"}}}").getAsJsonObject());
        JsonObject g = peak(p, "가야산");
        assertFalse(g.has("foliage_start"));
        assertFalse("벚꽃은 mountain 이 있을 때만 산에", g.has("cherry_peak"));
        assertEquals("단풍 절정 2025년 11월 5일", MountainServlet.seasonLine(g, MountainServlet.SEASONS[2]));
    }
}
