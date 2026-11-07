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

/** 2026-11-07 홍TV님 전체 점검 2단계(편리함 · 화면). 산 이름 · 좌표는 data/mountains100.json 에서. */
public class FullReviewStage2Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonArray peaks() {
        return JsonParser.parseString("[{\"id\":\"설악산\",\"name\":\"설악산\",\"lat\":38.1192,\"lon\":128.4655}]").getAsJsonArray();
    }

    @Test
    public void indexPagesHaveSearchBox() {
        String ko = MountainServlet.indexPage(peaks(), new JsonArray(), "", false);
        assertTrue("코스 모음 설명 줄 바로 아래 검색칸", ko.contains("일몰을, 길을 고르면 노선 안내도를 봅니다.</p><form class=\"mSearch\" role=\"search\" action=\"../hike.html\" method=\"get\">"));
        assertTrue(ko.contains("<input type=\"hidden\" name=\"lang\" value=\"ko\"><input type=\"search\" name=\"q\""));
        String en = MountainEn.indexPage(peaks(), new JsonArray(), "", "");
        assertTrue("영어는 두 단계 위", en.contains("route map.</p><form class=\"mSearch\" role=\"search\" action=\"../../hike.html\" method=\"get\"><input type=\"hidden\" name=\"lang\" value=\"en\">"));
        assertTrue(en.contains("placeholder=\"Mountain or trail (e.g. Seoraksan)\""));
    }

    @Test
    public void searchScriptsWired() throws Exception {
        for (String p : new String[] {"src/main/webapp/js/mountain.js", "src/main/webapp/js/mountain-en.js"})
            assertTrue(p, read(p).contains("window.RF.peakHref(mSearch.elements.q.value, items)"));
        String hike = read("src/main/webapp/js/hike.js");
        assertTrue("따라가기는 ?q= 를 마지막 검색으로", hike.contains("var URL_Q = RF.urlQuery(location.search);") && hike.contains("last = { q: URL_Q, kind: \"\" }"));
        assertTrue("검색 실패에 영어 예외 글을 보이지 않음", !hike.contains("\"Search failed: \") + e.message") && hike.contains("인터넷이 끊겨 찾을 수 없습니다."));
        assertTrue(read("src/main/webapp/js/kit-m.js").contains("function peakHref("));
    }

    @Test
    public void followIsMainButton() {
        JsonObject c = JsonParser.parseString("{\"course_id\":\"frst-1-a\",\"name\":\"설악산 · 오색 → 대청봉\",\"kind\":\"hike\",\"distance_m\":5000,\"ascent_m\":1200,"
                + "\"start_lat\":38.10,\"start_lon\":128.52,\"end_lat\":38.1192,\"end_lon\":128.4655}").getAsJsonObject();
        String page = CoursePageServlet.page(c, null, null, null, null, new JsonArray(), true, "https://r.kr", List.of());
        int follow = page.indexOf("<a class=\"main\" href=\"../hike.html?lang=ko#c=frst-1-a"), fly = page.indexOf("/index.html?lang=ko#c=frst-1-a");
        assertTrue("따라가기가 맨 앞 주 단추", follow > 0 && fly > follow);
    }

    @Test
    public void touchSizes() throws Exception {
        String css = read("src/main/webapp/css/mountain.css");
        assertTrue(css.contains(".cp .go a { display:inline-flex; align-items:center; min-height:44px;"));
        assertTrue(css.contains("form.mSearch input[type=search] { flex:1; min-width:0; min-height:44px;") && css.contains("font-size:16px;"));
        String kit = read("src/main/webapp/css/course-kit.css");
        assertTrue("지도 출처(ⓘ) 단추 40px", kit.contains(".maplibregl-ctrl-attrib-button { width:40px; height:40px;"));
        assertTrue("긴 코스 이름은 두 줄", read("src/main/webapp/hike.html").contains("-webkit-line-clamp:2;"));
    }
}
