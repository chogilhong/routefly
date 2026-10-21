package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.TreeMap;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 운영 통계(2026-10-15) - 셀 화면 · 로봇 · 열쇠 · 보기 화면. */
public class StatsTest {

    @Test
    public void pageKeys() {
        assertEquals("/m/가야산", Stats.pageKey("/m/%EA%B0%80%EC%95%BC%EC%82%B0"));
        assertEquals("/m/", Stats.pageKey("/m/"));
        assertEquals("/index.html", Stats.pageKey("/"));
        assertEquals("/hike.html", Stats.pageKey("/hike.html"));
        assertEquals("/s/", Stats.pageKey("/s/knps-7013"));
        assertNull(Stats.pageKey("/api/courses"));
        assertNull(Stats.pageKey("/js/app.js"));
        assertNull("긴 이름(꾸민 주소)은 안 셈", Stats.pageKey("/m/" + "가".repeat(50)));
    }

    @Test
    public void bots() {
        assertNotNull(Stats.botKind("Mozilla/5.0 (compatible; Googlebot/2.1)"));
        assertNotNull(Stats.botKind("facebookexternalhit/1.1"));
        assertNotNull(Stats.botKind("Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"));
        assertNotNull(Stats.botKind(null));
        assertNull(Stats.botKind("Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"));
        // 종류(2026-10-20 홍TV님 "나눠서 세기")
        assertEquals("검색", Stats.botKind("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
        String pc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";
        assertNull("사람 브라우저는 언어 설정을 보냄", Stats.botKind(pc, "ko-KR,ko;q=0.9"));
        assertEquals("언어 설정이 없으면 숨은 로봇", "숨은 로봇", Stats.botKind(pc, null));
        assertEquals("Claude 앱 · PC Claude 는 시험", "시험", Stats.botKind("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Claude/2.42304 Chrome/138 Electron/37.2.0 Safari/537.36", "ko"));
        assertEquals("이름을 댄 로봇은 그 종류", "검색", Stats.botKind("Mozilla/5.0 (compatible; Googlebot/2.1)", null));
        assertEquals("검색", Stats.botKind("Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"));
        assertEquals("검색", Stats.botKind("Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)"));
        assertEquals("미리보기", Stats.botKind("facebookexternalhit/1.1"));
        assertEquals("미리보기", Stats.botKind("Mozilla/5.0 (Mobile; KAKAOTALK-SCRAP; ...)"));
        assertEquals("미리보기", Stats.botKind("Slackbot-LinkExpanding 1.0"));
        assertEquals("시험", Stats.botKind("curl/8.5.0"));
        assertEquals("시험", Stats.botKind("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36"));
        assertEquals("시험", Stats.botKind(""));
        assertEquals("기타", Stats.botKind("Mozilla/5.0 (compatible; AhrefsBot/7.0)"));
        assertEquals("기타", Stats.botKind("Mozilla/5.0 (compatible; GPTBot/1.2)"));
        assertNull("다음 앱 손님은 사람", Stats.botKind("Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 DaumApps/7.2.1"));
        assertNull("네이버 앱 손님은 사람", Stats.botKind("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.4)"));
        assertNull(Stats.botKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"));
        java.util.Map<String, Integer> m = new java.util.HashMap<>();
        assertEquals("", StatsServlet.botLine(m));
        m.put("기타", 3); m.put("검색", 1200);
        assertEquals(" (검색 1,200 · 기타 3)", StatsServlet.botLine(m));
        java.util.TreeMap<String, JsonObject> days = new java.util.TreeMap<>();
        days.put("2026-10-21", JsonParser.parseString("{\"pages\":{},\"uniq\":0,\"bots\":5,\"botKinds\":{\"검색\":4,\"시험\":1}}").getAsJsonObject());
        String html = StatsServlet.page(days, 30, null);
        assertTrue(html.contains("로봇 5 (검색 4 · 시험 1)") && html.contains("로봇 종류"));
        assertTrue("방문 추세 · 날마다 · 모바일 PC 는 늘 펼침", html.contains("<section><h2>방문 추세") && html.contains("<section><h2>날마다</h2>") && html.contains("<section><h2>모바일 · PC 방문자"));
        assertTrue("나머지는 처음엔 접힘(누르면 펼침)", html.contains("<details class=\"fold\"><summary><h2>로봇 종류") && !html.contains("class=\"fold\" open"));
    }

    @Test
    public void keyAndPage() {
        assertFalse("설정이 없으면 닫힘", StatsServlet.allowed(null, "x"));
        assertFalse("짧은 열쇠는 안 받음", StatsServlet.allowed("short", "short"));
        assertEquals("보기 쿠키는 64자 hex", 64, StatsServlet.seeToken("abcdefghijkl").length());
        assertFalse("쿠키에 열쇠가 그대로 들지 않음", StatsServlet.seeToken("abcdefghijkl").contains("abcdefghijkl"));
        assertNotEquals("열쇠를 바꾸면 옛 쿠키는 안 맞음", StatsServlet.seeToken("abcdefghijkl"), StatsServlet.seeToken("abcdefghijkx"));
        assertTrue(StatsServlet.allowed("abcdefghijkl", "abcdefghijkl"));
        assertFalse(StatsServlet.allowed("abcdefghijkl", "abcdefghijkx"));
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-14", JsonParser.parseString("{\"pages\":{\"/m/가야산\":3,\"/hike.html\":5},\"uniq\":4,\"bots\":2}").getAsJsonObject());
        days.put("2026-10-15", JsonParser.parseString("{\"pages\":{\"/m/가야산\":2,\"/m/<b>\":1},\"uniq\":2,\"bots\":0}").getAsJsonObject());
        String h = StatsServlet.page(days, 30, null);
        assertTrue(h.contains("방문자(하루마다 센 수의 합) 6 · 화면 11"));
        assertTrue("인기 산 합", h.contains("<td>가야산</td><td>5</td>"));
        assertTrue("이름은 이스케이프", h.contains("&lt;b&gt;") && !h.contains("<td><b></td>"));
    }

    @Test
    public void sources() {
        assertEquals("네이버", Stats.source("https://m.search.naver.com/search.naver?query=%EA%B0%80%EC%95%BC%EC%82%B0", "routefly.kr"));
        assertEquals("구글", Stats.source("https://www.google.co.kr/", "routefly.kr"));
        assertEquals("카카오", Stats.source("https://talk.kakao.com/", "routefly.kr"));
        assertEquals("다음", Stats.source("https://search.daum.net/search?q=x", "routefly.kr"));
        assertEquals("직접 · 앱", Stats.source(null, "routefly.kr"));
        assertNull("사이트 안", Stats.source("https://routefly.kr/routefly/m/", "routefly.kr"));
        assertNull(Stats.source("https://abc-def.trycloudflare.com/routefly/", "abc-def.trycloudflare.com"));
        assertEquals("그 밖", Stats.source("https://notgoogle.com/", "routefly.kr"));
        assertEquals("그 밖", Stats.source("::bad", "routefly.kr"));
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-14", JsonParser.parseString("{\"pages\":{},\"uniq\":1,\"bots\":0,\"refs\":{\"네이버\":3}}").getAsJsonObject());
        days.put("2026-10-15", JsonParser.parseString("{\"pages\":{},\"uniq\":1,\"bots\":0,\"refs\":{\"네이버\":2,\"구글\":1}}").getAsJsonObject());
        String h = StatsServlet.page(days, 30, null);
        assertTrue(h.contains("<td>네이버</td><td>5</td>") && h.contains("<td>구글</td><td>1</td>"));
    }

    /** 모바일 · PC, 화면 이름 칸(2026-10-20). */
    @Test
    public void deviceAndNames() {
        assertEquals("모바일", Stats.device("Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"));
        assertEquals("모바일", Stats.device("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"));
        assertEquals("모바일", Stats.device("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"));
        assertTrue("사람이 연 화면", Stats.isPageView(null));
        assertFalse("서비스워커가 미리 받아 두는 것(X-RF-Prefetch)은 안 셈", Stats.isPageView("1"));
        assertEquals("PC", Stats.device("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"));
        assertEquals("따라가기", StatsServlet.pageName("/hike.html"));
        assertEquals("산 소개(영어) - naejangsan", StatsServlet.pageName("/en/m/naejangsan"));
        assertEquals("", StatsServlet.pageName("/zzz.html"));
        assertTrue("지운 화면도 이름(옛 주소 · 옛 북마크로 옴)", StatsServlet.pageName("/subway.html").startsWith("지하철 노선도"));
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-19", JsonParser.parseString("{\"pages\":{\"/hike.html\":5},\"uniq\":4,\"bots\":0}").getAsJsonObject());
        days.put("2026-10-20", JsonParser.parseString("{\"pages\":{\"/hike.html\":9,\"/c/\":3},\"uniq\":5,\"bots\":1,"
                + "\"dev\":{\"모바일\":8,\"PC\":4},\"devUniq\":{\"모바일\":3,\"PC\":2}}").getAsJsonObject());
        String h = StatsServlet.page(days, 30, null);
        assertTrue("날마다 표 - 모바일 · PC 칸", h.contains("<tr><td>2026-10-20</td><td>5</td><td>3</td><td>2</td><td>12</td><td>1</td></tr>"));
        assertTrue("세기 전 날은 -", h.contains("<tr><td>2026-10-19</td><td>4</td><td>-</td><td>-</td>"));
        assertTrue("화면 이름 칸", h.contains("<td>/hike.html</td><td>따라가기</td><td>14</td>"));
        assertTrue(h.contains("<td>모바일</td><td>3</td>"));
    }

    /** 방문 추세 그림(2026-10-20) - 빈 날은 0, 눈금 올림, 최근 n 일. */
    @Test
    public void trend() {
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-14", JsonParser.parseString("{\"pages\":{\"/hike.html\":5},\"uniq\":4,\"bots\":0}").getAsJsonObject());
        days.put("2026-10-16", JsonParser.parseString("{\"pages\":{\"/hike.html\":130},\"uniq\":37,\"bots\":0}").getAsJsonObject());
        String h = StatsServlet.trend(days, 30);
        assertTrue("빈 날(10-15)은 0", h.contains("<title>2026-10-15 · 방문자 0</title>"));
        assertTrue(h.contains("<title>2026-10-16 · 화면 130</title>"));
        assertTrue(h.contains("방문 추세(3일)"));
        assertTrue("눈금 위끝 50(37 올림)", h.contains(">50</text>"));
        assertTrue("눈금 위끝 200(130 올림)", h.contains(">200</text>"));
        assertFalse("최근 2일만이면 10-14 빠짐", StatsServlet.trend(days, 2).contains("2026-10-14"));
        assertEquals("", StatsServlet.trend(new TreeMap<>(), 30));
        assertEquals(1, StatsServlet.nice(1));
        assertEquals(500, StatsServlet.nice(301));
        assertEquals(1000, StatsServlet.nice(1000));
        assertTrue("보기 화면에 들어감", StatsServlet.page(days, 30, null).contains("방문 추세"));
    }

    /** 운영자 기기(/stats 를 연 브라우저)는 방문 수에서 뺌(2026-10-20 홍TV님). */
    @Test
    public void ownerNotCounted() {
        assertTrue(StatsFilter.owner("a=b; rf-owner=1"));
        assertTrue(StatsFilter.owner("rf-owner=1"));
        assertFalse(StatsFilter.owner(null));
        assertFalse(StatsFilter.owner("rf-owner=0; x-rf-owner=1"));
    }

    /** 인기 코스 상위 20 · 영어 산 표 · 보는 법(2026-10-21 홍TV님). */
    @Test
    public void coursesAndEnglishTable() {
        assertEquals("frst-123", Stats.courseKey("/c/frst-123"));
        assertNull(Stats.courseKey("/c/"));
        assertNull(Stats.courseKey("/c/<x>"));
        assertNull(Stats.courseKey("/m/가야산"));
        TreeMap<String, JsonObject> days = new TreeMap<>();
        days.put("2026-10-21", JsonParser.parseString("{\"pages\":{\"/c/\":5,\"/m/가야산\":2,\"/en/m/daeamsan\":3},\"uniq\":3,\"bots\":0,"
                + "\"courses\":{\"frst-1\":4,\"kmp-9\":1}}").getAsJsonObject());
        assertEquals(java.util.List.of("frst-1", "kmp-9"), StatsServlet.topCourses(days, 30, 20));
        String h = StatsServlet.page(days, 30, java.util.Map.of("frst-1", "가야산 <해인사>"));
        assertTrue(h.contains("인기 코스 상위 20") && h.contains("<a href=\"c/frst-1\">가야산 &lt;해인사&gt;</a>") && h.contains(">kmp-9</a>"));
        int en = h.indexOf("인기 산 페이지 - 영어"), pagesAt = h.indexOf("화면별(");
        assertTrue("영어 표에 daeamsan", en > 0 && h.indexOf("daeamsan", en) > en && h.indexOf("daeamsan", en) < pagesAt);
        assertFalse("화면별 표에는 안 섞임", h.substring(pagesAt).contains("/en/m/daeamsan"));
        assertTrue(h.contains("📖 통계 보는 법"));
        String bt = StatsServlet.botTable(java.util.Map.of("검색", 12));
        assertTrue(bt.contains("<td>검색</td><td>구글") && bt.contains("<td>12</td>") && bt.contains("<td>미리보기</td>"));
    }
}
