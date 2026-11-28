package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;

/**
 * 기능별 매뉴얼 5편 링크(2026-11-28 홍TV님 "이거 해줘" - 올린 주소는 docs/youtube/guide/manual/올리기.md):
 * 코스 모음 첫 화면 "▶ 기능별 사용법 5편" 펼침 + 각 화면(따라가기 · 기록 보기 · GPX 편집 · 산악회 방)에 그 편.
 */
public class ManualVideoLinksTest {

    private static String read(String f) throws Exception {
        return new String(Files.readAllBytes(Paths.get("src/main/webapp/" + f)), StandardCharsets.UTF_8);
    }

    private static String a(String id) {
        return "href=\"https://youtu.be/" + id + "\" target=\"_blank\" rel=\"noopener\"";
    }

    @Test
    public void 코스_모음_다섯_편() throws Exception {
        // 2026-11-28 홍TV님 "이거 정리 좀 하게" 1안: 단추 하나 → 처음이라면 · 기능별 · 산악회 세 줄(7편)
        String ko = MountainServlet.indexPage(new JsonArray(), new JsonArray(), "https://r.kr", false, "", "", new JsonArray());
        int nav = ko.indexOf("<nav class=\"vids\""), more = ko.indexOf("<details class=\"fold kind vidMore\"><summary><span class=\"ft\">▶ 사용법 영상</span><span class=\"fs\">처음이라면 · 기능별 · 산악회 7편</span><span class=\"fa\">▾</span></summary><div class=\"fb\"><dl>"), end = ko.indexOf("</nav>", nav);
        assertTrue("접는 칸 하나(📍 내 근처 칸과 같은 모양 - 2026-11-28 홍TV님 \"평범한 것이 좋아\") - 그 안에 접힌 채", nav >= 0 && more == ko.indexOf(">", nav) + 1 && end > more);
        String box = ko.substring(more, end);
        assertEquals("링크는 모두 접힌 칸 안", 7, box.split("https://youtu.be/", -1).length - 1);
        assertTrue(box.contains("<dt>처음이라면</dt><dd><a " + a("K1oKGDTY5t0") + ">▶ 전체 사용법(약 14분)</a></dd>"));
        assertTrue(box.contains("<dt>기능별</dt><dd><a " + a("nHchQthrvvg") + ">1 따라가기</a> · <a " + a("btKasNynfJo") + ">2 GPX 열기</a> · <a "
                + a("ieeWYheGOJ8") + ">3 3D 영상</a> · <a " + a("u-O9cRlnk1Y") + ">5 GPX 편집</a></dd>"));
        assertTrue(box.contains("<dt>산악회</dt><dd><a " + a("67xWxottGa4") + ">▶ 회원용</a> · <a " + a("AoQexAxZ-58") + ">▶ 인솔자용</a></dd>"));
        String css = read("css/mountain.css");
        assertTrue(css.contains(".vids { background:var(--panel); border:1px solid var(--ln); border-radius:12px;") && css.contains(".vidMore dl {"));
        assertFalse("빨간 알약 단추 모양은 뺌", css.contains(".vidMore > summary {"));
        assertTrue("접힌 채일 때 밑줄 없음(📍 내 근처 칸과 같게)", css.contains("\n.vids > .fold:not([open]) > summary { border-bottom-color:transparent; }"));
        assertFalse("옛 빨간 단추 모양(.vids a)은 뺌", css.contains("\n.vids a {"));
    }

    @Test
    public void 화면마다_그_편() throws Exception {
        assertTrue("따라가기 목록 아랫줄 - 1편", read("hike.html").contains("<a href=\"#\" data-onboard>❓ 사용법</a> · <a " + a("nHchQthrvvg")));
        String trip = read("trip.html");
        assertTrue("기록 보기 첫 안내 - 2 · 3편", trip.contains("<a " + a("btKasNynfJo") + ">▶ 기록 보기 사용법 영상</a>") && trip.contains("<a " + a("ieeWYheGOJ8") + ">▶ 3D 영상 만들기 사용법</a>"));
        String studio = read("studio.html");
        assertTrue("GPX 편집 위 ❓ 사용법 옆 - 5편", studio.contains("❓ 사용법</button><a id=\"helpVid\" " + a("u-O9cRlnk1Y")) && studio.contains("#helpVid {"));
        String party = read("party.html");
        assertTrue("산악회 참가하기 - 4편", party.contains("<a class=\"guideLink\" " + a("67xWxottGa4") + " data-en=\"▶ Member guide video (in Korean)\">▶ 회원 사용법 영상</a>"));
        assertTrue("방 만들기 - 인솔자 영상", party.contains("<a class=\"guideLink\" " + a("AoQexAxZ-58") + " data-en=\"▶ Leader guide video (in Korean)\">▶ 인솔자 사용법 영상</a>"));
    }
}
