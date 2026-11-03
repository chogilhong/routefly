package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-02 홍TV님: 사무실에서 연 산악회 방의 위쪽 "뒤로" 는 사무실 화면으로(회원 · 인솔자는 그대로 산 모음). */
public class PartyOfficeBackTest {

    @Test
    public void officeSeatBackGoesToOffice() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(js.contains("var OFFICE_HOME = EN ? \"party-office.html?lang=en\" : \"party-office.html\";"));
        int at = js.indexOf("if ((RFParty.get() || {}).office) {");
        assertTrue("사무실 자리일 때만", at > 0);
        String body = js.substring(at, js.indexOf("\n    }\n", at));
        assertTrue(body.contains("$(\"back\").href = OFFICE_HOME;") && body.contains("T(\"‹ 사무실\", \"‹ Office\")"));
        assertTrue("방 끝 뒤에도 같은 곳(기록을 남기지 않음)", js.contains("if (office) location.replace(OFFICE_HOME);"));
        assertTrue("위 · 아래 두 고리 모두 toOffice", body.contains("addEventListener(\"click\", toOffice)") && js.contains("$(\"officeBack\").querySelector(\"a\").addEventListener(\"click\", toOffice)"));
        String html = Files.readString(Path.of("src/main/webapp/party.html"), StandardCharsets.UTF_8);
        assertTrue("기본은 코스 모음(2026-11-02 점검 - m/ 로 가는 단추는 모두 같은 이름)", html.contains("<a id=\"back\" href=\"m/\">‹ 코스 모음</a>"));
    }

    /** 사무실 → 열기 → ‹ 사무실 → ‹ 뒤로 가 방으로 돌아오지 않음(2026-11-02 PC: 끝없이 돌았음) - node 로 가짜 브라우저 기록을 따라감. */
    @Test
    public void officeRoomBackDoesNotLoop() throws Exception {
        ReviewRound5Test.node("src/test/js/office-nav.test.js");
        String office = Files.readString(Path.of("src/main/webapp/js/party-office.js"), StandardCharsets.UTF_8);
        assertTrue("사무실 ‹ 뒤로 는 이 탭의 사무실 방을 지움", office.contains("sessionStorage.removeItem(RFParty.KEY)") && office.contains("RFParty.officeNav(\"office\""));
    }

    /** 2026-11-03 홍TV님: 따라가기 → "산악회 방 열기" 면 위 단추가 "‹ 코스 모음" 이 아니라 "‹ 뒤로" - 연 화면(따라가기)으로. 판단은 office-nav.test.js 가 돌려 봄. */
    @Test
    public void roomBackReturnsToOpener() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = js.indexOf("} else {", js.indexOf("if ((RFParty.get() || {}).office) {"));
        String body = js.substring(at, js.indexOf("\n    }\n", at));
        assertTrue("사무실 자리가 아닐 때", body.contains("RFParty.roomFrom(document.referrer, location.origin, saved)"));
        assertTrue("이름은 늘 ‹ 뒤로", body.contains("$(\"back\").textContent = T(\"‹ 뒤로\", \"‹ Back\");") && !body.contains("따라가기\", \"‹ Follow"));
        assertTrue("바로 앞이면 되돌아감", body.contains("document.referrer === from && history.length > 1"));
        ReviewRound5Test.node("src/test/js/office-nav.test.js");
    }
}
