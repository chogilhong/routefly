package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 2026-11-07 홍TV님 전체 점검 1단계(안전 · 데이터 지키기) - 웹 쪽. 값은 규칙을 보려고 만든 테스트 데이터. */
public class FullReviewStage1Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonObject o(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    @Test
    public void summitMissShownOnEnglishAndCoursePages() {
        JsonObject peak = o("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.8225,\"lon\":128.1228}");
        JsonObject c = o("{\"course_id\":\"frst-1-a\",\"name\":\"가야산 · 해인사 → 상왕봉\",\"kind\":\"hike\",\"distance_m\":4000,\"ascent_m\":700,"
                + "\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8226,\"end_lon\":128.1229,\"summit_miss\":\"상왕봉\"}");
        String en = MountainEn.page(peak, new ArrayList<>(List.of(c)), new ArrayList<>(), null, "https://r.kr");
        assertTrue("영어 산 페이지에도 정상 미포함", en.contains("⚠ does not reach") && en.contains("(상왕봉)"));
        assertTrue("영어 3D 링크도 m= (‹ 가 산 페이지로)", en.contains("/index.html?lang=en#c=frst-1-a&amp;m="));
        String ko = MountainServlet.page(peak, new ArrayList<>(List.of(c)), new ArrayList<>(), null, "https://r.kr");
        assertTrue(ko.contains("⚠ 상왕봉 정상 미포함"));
        String page = CoursePageServlet.page(c, null, null, null, null, new JsonArray(), true, "https://r.kr", List.of());
        assertTrue("코스 페이지에도", page.contains("<dt>주의</dt><dd>⚠ 상왕봉 정상 미포함"));
    }

    @Test
    public void mountainPageUsesOfficialLevel() {
        JsonObject c = o("{\"course_id\":\"knps-1-a\",\"distance_m\":1000,\"ascent_m\":50,\"level\":\"보통(2.57)\"}");
        assertTrue(MountainServlet.chipFor(c, 1000, 50, null, false).contains("공단 보통(2.57)"));
        assertTrue(MountainServlet.chipFor(c, 1000, 50, null, true).contains("KNPS Moderate"));
        JsonObject plain = o("{\"course_id\":\"frst-1-a\",\"distance_m\":1000,\"ascent_m\":50}");
        assertEquals("공단 난이도가 없으면 어림", MountainServlet.levelChip(1000, 50, null, false), MountainServlet.chipFor(plain, 1000, 50, null, false));
    }

    @Test
    public void englishWordsSameAsScreen() throws Exception {
        String js = read("src/main/webapp/js/course-kit.js");
        String list = js.substring(js.indexOf("var EN_WORDS = ["), js.indexOf("];", js.indexOf("var EN_WORDS = [")));
        Matcher m = Pattern.compile("\\[\"([^\"]*)\", \"([^\"]*)\"\\]").matcher(list);
        List<String> screen = new ArrayList<>(), server = new ArrayList<>();
        while (m.find()) screen.add(m.group(1) + "=" + m.group(2));
        for (String[] w : MountainEn.WORDS) server.add(w[0] + "=" + w[1]);
        assertEquals("course-kit.js EN_WORDS 와 MountainEn.WORDS 가 같아야 함", screen, server);
        assertEquals("Guryong valley · spring → observatory", MountainEn.courseName("구룡계곡 · 약수터 → 전망대"));
        assertEquals("junction above 250m", MountainEn.courseName("갈림길 위 250m"));
    }

    @Test
    public void fuelAsksOnlyKnownSido() {
        JsonArray sido = JsonParser.parseString("[{\"SIDOCD\":\"01\",\"SIDONM\":\"서울\"},{\"SIDOCD\":\"02\",\"SIDONM\":\"경기\"}]").getAsJsonArray();
        assertTrue(FuelServlet.knownSido(sido, "01"));
        assertFalse("오피넷 시도 목록에 없는 코드는 최저가를 묻지 않음", FuelServlet.knownSido(sido, "99"));
        assertFalse("시도 목록을 못 받았으면 묻지 않음", FuelServlet.knownSido(null, "01"));
    }

    @Test
    public void threeDClockIsKoreaTime() throws Exception {
        String app = read("src/main/webapp/js/app.js");
        String fn = app.substring(app.indexOf("function clockText(ms)"), app.indexOf("}", app.indexOf("function clockText(ms)")));
        assertTrue("3D 시각도 한국 시간(따라가기 clock 과 같게)", fn.contains("ms + 9 * 3600000") && fn.contains("getUTCHours"));
        assertFalse("출발 시각을 폰 시간대로 읽지 않음", app.contains("d0.setHours("));
    }

    @Test
    public void logKeyHidesRoomCodesAndRawAccessLog() throws Exception {
        String r = read("tools/log-key/routefly-logs-read");
        assertTrue("산악회 기록 · 원본 접속 기록은 log 로 안 봄", r.contains("party*|localhost_access_log*)"));
        assertTrue("방 · 회사 코드 가림", r.contains("mask() {") && r.contains("| mask ;;"));
        String b = read("tools/log-key/routefly-batchlogs-read");
        assertTrue("가린 뒤 줄에서 다시 찾아 셈", b.contains("| clean | grep -aF -- \"$2\""));
    }
}
