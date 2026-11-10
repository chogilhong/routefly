package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 앱으로 손님 데려오기(2026-11-10 홍TV님 "작업해줘" - 원스토어 출시 뒤):
 * ① 안드로이드 브라우저에만 "원스토어에서 '루트플라이' 받기" 띠(js/app-store.js, [data-app-store] 칸 - 코스 모음 · 산 · 코스 페이지 · 따라가기 첫 화면 · 안내)
 * ② 사이트에 한글 이름 "루트플라이"(코스 모음 제목 · 설명, 따라가기 · 3D 제목, 안내) ③ 브라우저로 산행을 시작하면 하루 한 번 앱 권유.
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
        for (String page : new String[] {"hike", "about"}) {
            String h = read("src/main/webapp/" + page + ".html");
            assertTrue(page, h.contains("<div data-app-store hidden></div>") && h.contains("<script src=\"js/app-store.js\"></script>"));
        }
        assertTrue("신호 없을 때도", read("src/main/webapp/sw.js").contains("\"js/app-store.js\""));
    }

    @Test
    public void koreanNameAndStartTip() throws Exception {
        assertTrue(MountainServlet.indexPage(new com.google.gson.JsonArray(), new com.google.gson.JsonArray(), "https://routefly.kr/routefly", false)
                .contains("<title>루트플라이 100대 명산 · 둘레길 · 자전거길 코스 - routefly</title>"));
        assertTrue(read("src/main/webapp/hike.html").contains("<title>routefly(루트플라이) 따라가기</title>"));
        assertTrue(read("src/main/webapp/index.html").contains("<title>routefly(루트플라이) 코스 미리보기</title>"));
        assertTrue(read("src/main/webapp/about.html").contains("routefly(루트플라이)는"));
        String js = read("src/main/webapp/js/hike.js");
        assertTrue("브라우저 산행 시작 - 하루 한 번", js.contains("RFAppStore.android() && lsGet(\"rf-app-tip\") !== tipDay"));
    }
}
