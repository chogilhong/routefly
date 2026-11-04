package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-04 홍TV님 "앱이랑 크롬 저장 공간 따로인 거 안내해줘 - 처음에 안내" - 오프라인 저장은 저장한 곳(크롬 · 삼성 인터넷 · 앱)마다 따로. */
public class OfflineWhereTest {

    static final String KO = "저장은 저장한 곳(크롬 · 삼성 인터넷 · routefly 앱)마다 따로라, 산에서도 같은 곳으로 여세요.";
    static final String EN = "Saves are kept separately in each place (Chrome, Samsung Internet, the routefly app) - open it the same way in the mountains.";

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8);
    }

    @Test
    public void toldWhereSavesLive() throws Exception {
        String hike = read("src/main/webapp/hike.html");
        int ob = hike.indexOf("<h2 data-en=\"On the trail\">산행하기</h2>"), sheet = hike.indexOf("<div id=\"saveSheet\"");
        assertTrue("처음 안내(산행하기 쪽)에 한 · 영", ob > 0 && hike.indexOf(KO, ob) > ob && hike.indexOf(KO, ob) < sheet && hike.indexOf(EN, ob) < sheet);
        assertTrue("📥 오프라인 저장 창에도", hike.indexOf(KO, sheet) > sheet && hike.indexOf(EN, sheet) > sheet);
        assertTrue("산 페이지 📥 신호 없을 때 보기", read("src/main/webapp/js/mountain.js").contains(KO) && read("src/main/webapp/js/mountain-en.js").contains(EN));
    }
}
