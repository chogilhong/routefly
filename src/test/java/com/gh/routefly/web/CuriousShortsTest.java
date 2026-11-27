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

/** ▶ 산에서 궁금한 것(data/curious.json, 2026-11-27 홍TV님 "그래 그렇게 하자. 진행해") - 코스 모음 칸 · 산 페이지 문답 한 목록. */
public class CuriousShortsTest {

    private static JsonArray videos() throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get("src/main/webapp/data/curious.json")), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("videos");
    }

    private static JsonObject peak(Double elev) {
        JsonObject p = new JsonObject();
        p.addProperty("id", "설악산");
        p.addProperty("summit", "대청봉");
        if (elev != null) p.addProperty("elev", elev);
        return p;
    }

    @Test
    public void 정상석_GPS_쇼츠가_목록에() throws Exception {
        JsonArray v = videos();
        assertEquals("LcpO9nK2EtM", v.get(0).getAsJsonObject().get("id").getAsString());   // 2026-11-27 홍TV님이 올린 영상(76.8초)
        assertEquals(76.8, v.get(0).getAsJsonObject().get("sec").getAsDouble(), 0.01);
        assertEquals("height", v.get(0).getAsJsonObject().getAsJsonObject("faq").get("at").getAsString());
    }

    @Test
    public void 높이가_있는_산만_높이_문답_아래에() throws Exception {
        JsonArray peaks = new JsonArray();
        JsonObject has = peak(1707.9), none = peak(null);
        peaks.add(has);
        peaks.add(none);
        MountainServlet.withCurious(peaks, videos());
        List<String[]> qa = MountainServlet.faq(has, "설악산", new ArrayList<>(), null);
        int h = -1, g = -1;
        for (int i = 0; i < qa.size(); i++) {
            if (qa.get(i)[0].equals("설악산 높이는 얼마인가요?")) h = i;
            if (qa.get(i)[0].equals("설악산 정상에서 내 폰(GPS) 높이가 정상석과 다른 이유는?")) g = i;
        }
        assertTrue("높이 문답", h >= 0);
        assertEquals("바로 아래", h + 1, g);
        assertEquals("https://www.youtube.com/shorts/LcpO9nK2EtM", qa.get(g)[2]);
        assertEquals("1분 17초", qa.get(g)[3]);
        assertTrue(qa.get(g)[1].contains("약 25m"));
        for (String[] x : MountainServlet.faq(none, "설악산", new ArrayList<>(), null)) assertFalse("높이 없는 산은 뺌", x[0].contains("GPS"));
        String ld = MountainServlet.faqLd(qa);
        assertTrue("검색용 문답에도", ld.contains("정상석과 다른 이유는?"));
        assertFalse("검색용 답에는 링크 없음", ld.contains("youtube"));
    }

    @Test
    public void 등산_시간_자리() {
        JsonArray vs = JsonParser.parseString("[{\"id\":\"AAAAAAAAAAA\",\"title\":\"t\",\"sec\":61,\"faq\":{\"at\":\"time\",\"q\":\"{산} 무릎?\",\"a\":\"답\"}},"
                + "{\"id\":\"bad id\",\"title\":\"x\",\"faq\":{\"at\":\"time\",\"q\":\"나쁜\",\"a\":\"x\"}}]").getAsJsonArray();
        JsonObject p = peak(null);
        JsonArray ps = new JsonArray();
        ps.add(p);
        MountainServlet.withCurious(ps, vs);
        List<String[]> t = MountainServlet.curiousQa(p, "도봉산", "time");
        assertEquals("ID 가 규칙에 안 맞으면 뺌", 1, t.size());
        assertEquals("도봉산 무릎?", t.get(0)[0]);
        assertEquals("1분 1초", t.get(0)[3]);
        assertTrue("다른 자리에는 없음", MountainServlet.curiousQa(p, "도봉산", "height").isEmpty());
    }

    @Test
    public void 코스_모음_칸() throws Exception {
        JsonArray peaks = JsonParser.parseString("[{\"id\":\"설악산\",\"lat\":38.1,\"lon\":128.4}]").getAsJsonArray();
        String idx = MountainServlet.indexPage(peaks, new JsonArray(), "https://r.kr", false, "", "", videos());
        assertTrue(idx, idx.contains("<span class=\"ft\">▶ 산에서 궁금한 것 <small>짧은 영상</small></span><span class=\"fs\">1편</span>"));
        assertTrue(idx.contains("<li><a href=\"https://www.youtube.com/shorts/LcpO9nK2EtM\" target=\"_blank\" rel=\"noopener\">정상석 높이와 내 GPS가 다른 이유 <small>1분 17초</small> ›</a></li>"));
        assertTrue("100대 명산 칸 다음", idx.indexOf("산에서 궁금한 것") > idx.indexOf(">설악산</a>"));
        assertFalse("영상이 없으면 칸도 없음", MountainServlet.indexPage(peaks, new JsonArray(), "https://r.kr", false, "", "", new JsonArray()).contains("산에서 궁금한 것"));
    }

    @Test
    public void 서블릿이_읽어_붙임() throws Exception {
        String src = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/MountainServlet.java")), StandardCharsets.UTF_8);
        assertTrue(src.contains("withCurious(p, cu);"));
        assertTrue(src.contains("seasonFold(hundred(all), season, java.time.LocalDate.now(WeatherServlet.KST)), curious)"));
        assertTrue("산 페이지 문답에 영상 링크", src.contains("x.length > 2 && x[2] != null"));
    }
}
