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
}
