package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** dronefly(2026-11-17 홍TV님): 코스 모음 타이드플라이 바로 아래 입구, 꼭 넣을 것(비행금지 · 허용구역 · 비행승인 요청), 위치는 폰 안에서만. */
public class DroneflyPageTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8);
    }

    @Test
    public void 타이드플라이_바로_아래_입구() {
        String r = MountainServlet.droneflyRow();
        assertTrue(r.contains("href=\"../dronefly.html\"") && r.contains("<img class=\"dIc\" src=\"../img/dronefly.svg\" width=\"20\" height=\"20\" alt=\"\"> drone<span class=\"fly\">fly</span>(드론)") && !r.contains("🚁"));
    }

    @Test
    public void 꼭_넣을_것과_위치는_폰_안에서만() throws Exception {
        String h = read("src/main/webapp/dronefly.html"), js = read("src/main/webapp/js/dronefly.js");
        assertTrue("허용구역(UA)", h.contains(">🟢 가까운 허용구역(UA)</h2>"));
        assertTrue("비행승인 요청", h.contains(">📝 비행승인 요청</h2>") && h.contains("href=\"https://drone.onestop.go.kr/\""));
        assertTrue("비행금지구역 판정", js.contains("'비행금지구역 - 승인 없이 날 수 없습니다'"));
        assertTrue("공역 파일을 받아 폰이 셈 - 위치를 서버로 보내는 곳 없음", js.contains("fetch('data/drone-airspace.json')") && !js.contains("api/drone") && js.contains("fetch('api/place?q=' + encodeURIComponent(q))"));
        assertTrue("개인정보처리방침", read("src/main/webapp/privacy.html").contains("<h2>dronefly(드론) (2026년 11월 17일부터)</h2>") && read("src/main/webapp/privacy-en.html").contains("<h2>dronefly (drones) (from November 17, 2026)</h2>"));
    }

    /** 머리 그림은 쿼드콥터(2026-11-17 홍TV님 "헬리콥터잖아. 드론으로") - 🚁 는 헬리콥터. */
    @Test
    public void 드론_그림은_헬리콥터가_아님() throws Exception {
        String h = read("src/main/webapp/dronefly.html");
        assertTrue(h.contains("<img class=\"dIc\" src=\"img/dronefly.svg\"") && !h.contains("🚁") && read("src/main/webapp/img/dronefly.svg").contains("<ellipse"));
    }

    /** 한/EN · 가(2026-11-17 홍TV님 "한/영, 가 도 넣어줘") - 타이드플라이와 같은 단추 · 같은 기억(tf-lang · tf-size). */
    @Test
    public void 한_EN_가_단추() throws Exception {
        String h = read("src/main/webapp/dronefly.html"), js = read("src/main/webapp/js/dronefly.js");
        int theme = h.indexOf("id=\"theme\""), lang = h.indexOf("<button type=\"button\" data-lang=\"ko\" aria-pressed=\"true\">한</button><button type=\"button\" data-lang=\"en\" aria-pressed=\"false\">EN</button>"), size = h.indexOf("id=\"size\"");
        assertTrue("모드 · 한/EN · 가 차례", theme > 0 && lang > theme && size > lang);
        assertTrue(h.contains("<h1 data-en=\"Before you fly\">드론 비행 전 확인</h1>") && js.contains("save('tf-lang', lang)") && js.contains("save('tf-size', next)"));
    }
}
