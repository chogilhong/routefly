package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;


import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** routefly 산 · 코스 페이지 밝은 · 다크 모드(2026-11-21 홍TV님 "드론플라이 처럼 라이트모드, 다크모드"). */
public class RouteflyThemeTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void 그리기_전에_모드() throws Exception {
        String early = read("src/main/webapp/js/rf-theme.js");
        assertTrue("기본은 다크, 고른 밝은 모드만", early.contains("localStorage.getItem(\"rf-theme\")") && early.contains("t === \"light\" ? \"light\" : \"dark\""));
        JsonObject peak = JsonParser.parseString("{\"id\":\"월출산\",\"name\":\"월출산\",\"summit\":\"천황봉\",\"lat\":34.76656,\"lon\":126.703896}").getAsJsonObject();
        String ko = MountainServlet.page(peak, new ArrayList<>(), new ArrayList<>(), null, "", 11);
        String en = MountainEn.page(peak, new ArrayList<>(), new ArrayList<>(), null, "");
        // 스크립트가 css 보다 앞(<head> 안) - 첫 그림부터 고른 모드
        assertTrue(ko.indexOf("src=\"../js/rf-theme.js") > 0 && ko.indexOf("src=\"../js/rf-theme.js") < ko.indexOf("css/mountain.css") && ko.indexOf("css/mountain.css") < ko.indexOf("</head>"));
        assertTrue(en.indexOf("src=\"../../js/rf-theme.js") > 0 && en.indexOf("src=\"../../js/rf-theme.js") < en.indexOf("css/mountain.css"));
    }

    @Test
    public void 밝은_색과_단추() throws Exception {
        String css = read("src/main/webapp/css/mountain.css");
        assertTrue(css.contains(":root[data-theme=\"light\"] { --bg:#eef2f6; --panel:#ffffff; --tx:#18212c;"));
        assertTrue("어두운 글자 로고", css.contains(":root[data-theme=\"light\"] img[src*=\"logo-dark.svg\"] { content:url(../img/logo.svg); }"));
        assertTrue(css.contains(".rfThemeBtn {"));
        String kit = read("src/main/webapp/js/course-kit.js");
        assertTrue(kit.contains("themeButton: themeButton") && kit.contains("var THEME_KEY = \"rf-theme\""));
        assertTrue("산 페이지 kit 에도", read("src/main/webapp/js/kit-m.js").contains("function themeButton("));
        assertTrue(read("src/main/webapp/js/mountain.js").contains("tools.appendChild(window.RF.themeButton())"));
        assertTrue(read("src/main/webapp/js/mountain-en.js").contains("tools.appendChild(RF.themeButton())"));
        // 다음 모드(순수 함수) - 다크 → 밝게 → 다크, 모르는 값은 다크로 보고 밝게
        String fn = kit.substring(kit.indexOf("function nextTheme("), kit.indexOf("function paintThemeBtns("));
        assertTrue(fn.contains("return t === \"light\" ? \"dark\" : \"light\";"));
    }

    @Test
    public void 앱_화면도_같은_모드() throws Exception {   // 2단계(2026-11-21 홍TV님 "계속해") - 따라가기 · 공원 · 노선 · 도장 · 별거 별거 · 안부 · 산악회 · 안내 …
        String[] pages = {"hike.html", "park.html", "route.html", "series.html", "tools.html", "anbu.html", "party.html", "party-office.html", "studio.html", "feedback.html",
                "about.html", "about-en.html", "privacy.html", "privacy-en.html", "terms.html", "terms-en.html", "lbs-terms.html", "lbs-terms-en.html", "party-guide.html", "party-guide-en.html"};
        for (String p : pages) {
            String h = read("src/main/webapp/" + p);
            int s = h.indexOf("<script src=\"js/rf-theme.js\"></script><link rel=\"stylesheet\" href=\"css/rf-light.css\">");
            assertTrue(p, s > 0 && s > h.indexOf("</style>"));   // 화면 <style> 뒤 · 그리기 전
        }
        assertTrue("개인정보처리방침에 저장 이름", read("src/main/webapp/privacy.html").contains("rf-theme") && read("src/main/webapp/privacy-en.html").contains("rf-theme"));
        // 입력 칸은 안쪽 다크 그대로 · 테두리만(2026-11-21 홍TV님) - 산악회 방 · 사무실 · 별거 별거 · 안부
        for (String p : new String[] {"party.html", "party-office.html", "tools.html", "anbu.html"})
            assertTrue(p, read("src/main/webapp/" + p).contains("{ color:#eef2f7; border-color:rgba(0,0,0,0.45); color-scheme:dark; }"));
        assertFalse("게임 판은 어두운 그림이라 다크 그대로", read("src/main/webapp/games.html").contains("rf-light.css"));
        String css = read("src/main/webapp/css/rf-light.css");
        assertTrue(css.contains(":root[data-theme=\"light\"] { --bg:#eef2f6; --panel:#ffffff; --tx:#18212c;") && css.contains("--onsky:#ffffff;"));
        assertTrue("하늘색 단추 글은 밝은 모드에서 흰색", read("src/main/webapp/hike.html").contains("#bar button.main { background:var(--sky); border-color:var(--sky); color:var(--onsky,#062b30);"));
        String sw = read("src/main/webapp/sw.js");
        assertTrue("산속(오프라인)에서도", sw.contains("\"js/rf-theme.js\", \"css/rf-light.css\"]"));
        for (String js : new String[] {"hike", "park", "route", "series", "tools", "anbu", "party"}) {
            assertTrue(js, read("src/main/webapp/js/" + js + ".js").contains("themeButton()"));
            assertTrue("kit-" + js, read("src/main/webapp/js/kit-" + js + ".js").contains("function themeButton("));
        }
    }
}
