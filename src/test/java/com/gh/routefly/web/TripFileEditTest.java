package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 📂 GPX 열기로 연 파일도 📐 GPX 편집으로(2026-11-24 홍TV님 "넣어줘") - 이 탭 sessionStorage 로만 넘김. */
public class TripFileEditTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 연_파일을_GPX_편집으로() throws Exception {
        String tjs = read("src/main/webapp/js/trip.js"), sjs = read("src/main/webapp/js/studio.js");
        assertTrue("파일 모드에 📐 보임 · 저장 · 삭제는 숨김", tjs.contains("$(\"recBtns\").hidden = false; $(\"rec-save\").hidden = true; $(\"rec-edit\").hidden = EN; $(\"rec-del\").hidden = true;"));
        assertTrue("선 · 이름만 sessionStorage 로, 편집기는 #file", tjs.contains("sessionStorage.setItem(\"rf-studio-in\", JSON.stringify({ name: got.rec.name || f.name, track: got.rec.track }));")
                && tjs.contains("location.href = \"studio.html#file\";"));
        assertTrue("편집기는 받아 넣고 바로 지움", sjs.contains("if (location.hash === \"#file\") return openFromFile();")
                && sjs.contains("o = JSON.parse(sessionStorage.getItem(\"rf-studio-in\") || \"null\"); sessionStorage.removeItem(\"rf-studio-in\");"));
        for (String page : new String[] {"privacy.html", "privacy-en.html"}) assertTrue("개인정보처리방침에 저장 열쇠 " + page, read("src/main/webapp/" + page).contains("(rf-studio-in,"));
    }
}
