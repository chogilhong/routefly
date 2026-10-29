package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 회사 사무실 영어(2026-10-29 홍TV님 "영어로는 회사 사무실이 없네") - 영어 화면에서 들어가는 길과, 화면 글이 모두 영어 짝을 가졌는지. */
public class OfficeEnglishTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void officeHasEnglish() throws Exception {
        String h = read("src/main/webapp/party-office.html");
        // 몸통의 한국어 글이 든 요소(주석 · 스타일 빼고)는 모두 data-en 짝이 있음
        String body = h.substring(h.indexOf("<body>")).replaceAll("(?s)<!--.*?-->", "");
        for (String line : body.split("\n")) {
            if (line.matches(".*[가-힣].*") && !line.contains("data-en")) {
                // 여러 줄 요소의 둘째 줄은 앞 줄에 data-en 이 있음
                assertTrue("영어 짝 없음: " + line.trim(), line.trim().matches("^[^<]*[가-힣][^<]*(</[a-z]+>)?$|^.*</b>.*$|^회원 화면.*|^링크를 잃어버리면.*"));
            }
        }
        String js = read("src/main/webapp/js/party-office.js");
        assertTrue(js.contains("var EN = /[?&]lang=en\\b/.test(location.search);") && js.contains("officeCsv(last.ended, EN)"));
        assertTrue("열기는 영어 인솔자 화면으로", js.contains("location.href = EN ? \"party.html?lang=en\" : \"party.html\";"));
        // 들어가는 길
        assertTrue(read("src/main/webapp/hike.html").contains("party-office.html?lang=en"));
        assertTrue(read("src/main/webapp/party.html").contains("data-en-href=\"party-office.html?lang=en\""));
        assertTrue(read("src/main/webapp/js/party.js").contains("EN ? \"party-office.html?lang=en\""));
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainEn.java").contains("/party-office.html?lang=en"));
    }
}
