package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 100대 명산 밖 이름난 산(2026-11-27 홍TV님 "사람들에게는 유명한 산인데 100대 명산에 안 들었다고 산 페이지에 없다는게 말이 돼? 만들어야지") -
 * data/mountains-more.json → 산 페이지 · 코스 모음 "⛰️ 이름난 산" 칸 · 코스 화면 · 공유 그림 · 사이트맵(한국어만). 100대 칸 · 100곳 수 · 영어 페이지는 그대로.
 */
public class MoreMountainsTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    private static JsonArray more() {
        return JsonParser.parseString("[{\"id\":\"청계산\",\"summit\":\"매봉\",\"lat\":37.43,\"lon\":127.05},"
                + "{\"id\":\"가야산\",\"lat\":35.8,\"lon\":128.1},"           // 100대와 겹침 - 뺌
                + "{\"id\":\"광교산\"},"                                        // 정상 자리 없음 - 뺌(지어내지 않음)
                + "{\"id\":\"먼산\",\"lat\":40.1,\"lon\":127.0},"               // 우리나라 밖 - 뺌
                + "{\"id\":\"<b>\",\"lat\":37.5,\"lon\":127.0}]").getAsJsonArray();   // 이름 꼴이 아님 - 뺌
    }

    @Test
    public void 이름난_산_목록() throws Exception {
        JsonArray hundred = JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
        JsonArray all = MountainServlet.plusMore(hundred, more());
        assertEquals("청계산 하나만 더해짐", hundred.size() + 1, all.size());
        JsonObject cg = MountainServlet.find(all, "청계산");
        assertTrue(MountainServlet.isMore(cg));
        assertEquals("이름이 없으면 id", "청계산", cg.get("name").getAsString());
        assertEquals("100대만", hundred.size(), MountainServlet.hundred(all).size());
        assertFalse("100대 쪽은 그대로", MountainServlet.isMore(MountainServlet.find(all, "가야산")));

        JsonArray groups = JsonParser.parseString(read("src/main/webapp/data/series.json")).getAsJsonObject().getAsJsonArray("groups");
        String idx = MountainServlet.indexPage(all, groups, "https://routefly.kr/routefly", false, "", "");
        assertTrue("100대 칸 수는 100곳 그대로", idx.contains("<span class=\"ft\">⛰️ 100대 명산</span><span class=\"fs\">" + hundred.size() + "곳</span>"));
        assertTrue("100대 칸 바로 아래 이름난 산 칸", idx.contains("</ul></details><details class=\"fold group\" name=\"group\"><summary><span class=\"ft\">⛰️ 이름난 산 <small>100대 명산 밖</small></span><span class=\"fs\">1곳</span>"));
        assertTrue(idx.contains("<li><a href=\"../m/%EC%B2%AD%EA%B3%84%EC%82%B0\">청계산</a></li>"));
        assertTrue("접힌 줄에도", idx.contains("<span class=\"fs\">100대 명산 · 이름난 산 · 백두대간 · 종주</span>"));
        assertFalse("영어 코스 모음 산 목록에는 없음", MountainEn.indexPage(MountainServlet.hundred(all), groups, "https://r.kr").contains("<small lang=\"ko\">청계산</small>"));
        assertEquals("이름난 산이 없으면 칸도 없음", -1, MountainServlet.indexPage(hundred, groups, "https://r.kr", false, "", "").indexOf("이름난 산"));

        String page = MountainServlet.page(cg, List.of(), List.of(), null, "https://routefly.kr/routefly", 11);
        assertTrue(page, page.contains("<p class=\"lead\">이름난 산(100대 명산 밖)"));
        assertTrue("경로 표시는 등산 코스", page.contains("\"name\":\"등산 코스\""));
        assertFalse(page.contains("산림청 100대 명산 선정 이유"));
        assertEquals("공유 그림 둘째 줄", "이름난 산 · 정상 매봉", OgServlet.korean(cg)[1]);
        // 정상 높이가 없는 이름난 산은 코스 최고점을 안 보임(옆 산 종주가 섞여 정상보다 높게 나왔음 - 2026-11-27 PC 사패산 740)
        JsonObject c = JsonParser.parseString("{\"course_id\":\"frst-1\",\"name\":\"옆 산까지\",\"kind\":\"hike\",\"distance_m\":5000,\"ascent_m\":600,\"ele_max_m\":740,\"start_lat\":37.43,\"start_lon\":127.05,\"end_lat\":37.45,\"end_lon\":127.06}").getAsJsonObject();
        String withTop = MountainServlet.page(cg, List.of(c), List.of(), null, "https://routefly.kr/routefly", 11);
        assertFalse(withTop.contains("코스 최고점"));
        assertEquals("100대 명산 쪽 셈은 그대로", Integer.valueOf(740), MountainServlet.courseTop(List.of(c), null));

        String sm = SitemapServlet.sitemap("https://r.kr", List.of("가야산"), List.of("청계산"), List.of());
        assertTrue("사이트맵 - 한국어 산 페이지만", sm.contains("<url><loc>https://r.kr/m/%EC%B2%AD%EA%B3%84%EC%82%B0</loc></url>") && !sm.contains("/en/m/cheonggyesan"));
        JsonObject f = JsonParser.parseString(read("src/main/webapp/data/mountains-more.json")).getAsJsonObject();
        assertTrue("자료 파일 - peaks · wanted", f.has("peaks") && f.has("wanted"));
        // 2026-11-27 PC 확인 6곳(docs/more-peaks-check.md) - 모두 자리 규칙을 지나 화면에 나옴
        JsonArray six = MountainServlet.plusMore(hundred, f.getAsJsonArray("peaks"));
        assertEquals(hundred.size() + 6, six.size());
        for (String id : new String[] {"불암산", "수락산", "사패산", "청계산", "광교산", "인왕산"}) assertTrue(id, MountainServlet.isMore(MountainServlet.find(six, id)));
        assertEquals("망경대", MountainServlet.find(six, "청계산").get("summit").getAsString());
    }
}
