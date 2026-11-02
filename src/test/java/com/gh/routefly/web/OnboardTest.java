package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 처음 안내(2026-11-02 홍TV님 "온보딩을 studio.html 에 넣어줘. 다른 곳에 온보딩 할 곳 있으면 추가해주고") - js/onboard.js 한 벌을 따라가기 · GPX 편집 · 산악회 방 인솔자가 씀.
 * 동작은 node(onboard.test.js), 여기서는 화면이 그 파일을 부르는지 · 다시 보기 단추 · 서비스 워커에 담기는지.
 */
public class OnboardTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 처음 한 번 · 다시 열기 · Esc · 자동 브라우저 · 따라가기 그대로 · GPX 편집 네 장(운영자 장) · 인솔자(SOS 때 안 띄움) · 길 찾기가 멈추지 않음. */
    @Test
    public void onboardJs() throws Exception {
        ReviewRound5Test.node("src/test/js/onboard.test.js");
    }

    @Test
    public void pagesLoadSharedOnboard() throws Exception {
        String studio = read("src/main/webapp/studio.html"), party = read("src/main/webapp/party.html"), hike = read("src/main/webapp/hike.html");
        assertTrue("GPX 편집 - 사용법 단추", studio.contains("<button type=\"button\" id=\"helpBtn\" data-onboard title=\"처음 안내 다시 보기\">❓ 사용법</button>"));
        assertTrue("GPX 편집 - studio.js 보다 먼저", studio.indexOf("js/onboard.js") > 0 && studio.indexOf("js/onboard.js") < studio.indexOf("js/studio.js"));
        assertTrue("산악회 방 - party.js 보다 먼저", party.indexOf("js/onboard.js") > 0 && party.indexOf("js/onboard.js") < party.indexOf("js/party.js\""));
        assertTrue("따라가기 - 화면의 다섯 장 그대로", hike.contains("<div id=\"onboard\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"obTitle\" hidden>") && hike.contains("<script src=\"js/onboard.js\"></script>"));
        assertTrue("서비스 워커에 이미 담김(산에서 신호 없어도 산악회 방이 열림)", read("src/main/webapp/sw.js").contains("\"js/onboard.js\""));
        String js = read("src/main/webapp/js/onboard.js");
        assertTrue("따라가기 열쇠 그대로(본 사람에게 다시 안 뜸)", js.contains("\"rf-onboard-v2\""));
        assertFalse("코스 모음 · 산 페이지(검색 손님)에는 안 넣음", read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains("onboard"));
    }
}
