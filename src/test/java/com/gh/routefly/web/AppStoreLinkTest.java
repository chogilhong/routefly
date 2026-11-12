package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 앱으로 손님 데려오기(2026-11-10 홍TV님 "작업해줘" - 원스토어 출시 뒤):
 * ① 안드로이드 브라우저에만 "원스토어에서 '루트플라이' 받기" 띠(js/app-store.js, [data-app-store] 칸 - 코스 모음 · 산 · 코스 페이지 · 따라가기 첫 화면 · 안내)
 * ② 사이트에 한글 이름 "루트플라이"(코스 모음 제목 · 설명, 따라가기 · 3D 제목, 안내) ③ 브라우저로 산행을 시작하면 앱 설치 확인 창(같은 날 홍TV님 "강요하듯이").
 */
public class AppStoreLinkTest {

    static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void bannerOnlyForAndroidBrowsers() throws Exception {
        ReviewRound5Test.node("src/test/js/app-store.test.js");
    }

    @Test
    public void pagesHaveSlotAndScript() throws Exception {
        String foot = MountainServlet.foot(null, true);
        assertTrue(foot.contains("<div data-app-store hidden></div>") && foot.contains("js/app-store.js"));
        String about = read("src/main/webapp/about.html"), hike = read("src/main/webapp/hike.html");
        assertTrue(about.contains("<div data-app-store hidden></div>") && about.contains("<script src=\"js/app-store.js\"></script>"));
        assertTrue(hike.contains("<script src=\"js/app-store.js\"></script>"));
        // 따라가기 첫 화면 가운데 - 고르기 단추 줄 아래 · 목록 위(2026-11-10 홍TV님 "첫 화면 중간에"), 목록(pickList) 밖이라 검색해도 안 지워짐
        int slot = hike.indexOf("<div data-app-store=\"12px 14px 0\" hidden></div>");
        assertTrue(slot > hike.indexOf("id=\"nearMe\"") && slot < hike.indexOf("<div id=\"pickList\">") && slot < hike.indexOf("id=\"pickFoot\""));
        assertTrue("신호 없을 때도", read("src/main/webapp/sw.js").contains("\"js/app-store.js\""));
        // 코스 모음 · 산 페이지는 첫 화면 쪽 칸이 맨 앞(2026-11-10 홍TV님 "제일 아래에 있네") - js 는 맨 앞 칸 하나만 채움
        String idx = MountainServlet.indexPage(new com.google.gson.JsonArray(), new com.google.gson.JsonArray(), "https://routefly.kr/routefly", false);
        assertTrue("검색 칸 바로 아래", idx.indexOf("data-app-store") > idx.indexOf("class=\"mSearch\"") && idx.indexOf("data-app-store") < idx.indexOf("id=\"near\""));
        String mp = read("src/main/java/com/gh/routefly/web/MountainServlet.java");
        assertTrue("산 페이지 - 코스 바로 보기 아래", mp.contains("개 바로 보기 ↓</a></p>\");\n        b.append(APP_SLOT);"));
        String js = read("src/main/webapp/js/app-store.js");
        assertTrue(js.contains("var box = document.querySelector(\"[data-app-store]\");") && !js.contains("querySelectorAll(\"[data-app-store]\")"));
    }

    @Test
    public void koreanNameAndStartTip() throws Exception {
        assertTrue(MountainServlet.indexPage(new com.google.gson.JsonArray(), new com.google.gson.JsonArray(), "https://routefly.kr/routefly", false)
                .contains("<title>루트플라이 100대 명산 · 둘레길 · 자전거길 코스 - routefly</title>"));
        assertTrue(read("src/main/webapp/hike.html").contains("<title>routefly(루트플라이) 따라가기</title>"));
        assertTrue(read("src/main/webapp/index.html").contains("<title>routefly(루트플라이) 코스 미리보기</title>"));
        assertTrue(read("src/main/webapp/about.html").contains("routefly(루트플라이)는"));
        String js = read("src/main/webapp/js/hike.js");
        // 2026-11-10 홍TV님 "강요하듯이 해. 앱을 설치하라고" - 새 산행을 시작할 때마다 확인 창(이 화면에서 한 번), "그래도 브라우저로" 는 남김(산에서 길 안내를 막지 않음)
        assertTrue(js.contains("if (!sim && !NATIVE && !saved && !appAsked && !EN && window.RFAppStore && RFAppStore.android()) {"));   // 앱 판별은 NATIVE(Capacitor) - BG 플러그인이 없는 앱에서도 설치를 권했음(2026-11-12 점검)
        assertTrue(js.contains("{ ok: \"원스토어에서 설치\", cancel: \"그래도 브라우저로\" }).then(function (ok) { if (ok) location.href = RFAppStore.url; else start(sim, checked); });"));
        assertFalse("하루 한 번 알림은 확인 창으로 바뀜", js.contains("rf-app-tip"));
        String as = read("src/main/webapp/js/app-store.js");
        assertTrue("센 문구 · 큰 설치 단추", as.contains("산에서는 routefly 앱을 설치해 쓰세요.") && as.contains("📲 원스토어에서 '루트플라이' 설치하기 ›"));
    }
}
