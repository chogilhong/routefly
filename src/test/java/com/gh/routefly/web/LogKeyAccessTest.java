package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Assume;
import org.junit.Test;

/**
 * 로그 열쇠 access 요약(tools/log-key/routefly-logs-read)의 넘김 · 오류 칸(2026-11-08 PC 요청 - 없어진 코스 주소 404 · 301 을 세려는데 요약이 400 넘는 줄을 안 셈).
 * 줄 모양은 docs/deploy-lightsail.md 의 AccessLogValve pattern("%{X-Forwarded-For}i %t "%m %U" %s %b "%{User-Agent}i"") 그대로,
 * 주소는 문서용 예시 주소(203.0.113.x, RFC 5737) - 실제 접속 기록은 개인정보라 쓰지 않음. python3 가 없으면 건너뜀.
 */
public class LogKeyAccessTest {

    /**
     * 진짜 python3 가 있나 - 없거나, 윈도의 스토어 바로 가기(WindowsApps\python3.exe - 실행은 되고 "Python was not found" · 끝 코드 9009, 2026-11-08 PC)면 false.
     */
    static boolean pythonOk() {
        try {
            Process v = new ProcessBuilder("python3", "--version").redirectErrorStream(true).start();
            String out = new String(v.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return v.waitFor() == 0 && out.startsWith("Python 3");
        } catch (Exception e) {
            return false;
        }
    }

    @Test
    public void countsRedirectsAndErrorsWithoutAddresses() throws Exception {
        String sh = new String(Files.readAllBytes(Path.of("tools/log-key/routefly-logs-read")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int a = sh.indexOf("<<'PY'\n") + 7, b = sh.indexOf("\nPY\n", a);
        Path py = Files.createTempFile("access", ".py"), log = Files.createTempFile("access", ".txt");
        try {
            Files.writeString(py, sh.substring(a, b + 1), StandardCharsets.UTF_8);
            String g = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", m = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";
            Files.writeString(log, String.join("\n",
                    "203.0.113.5 [08/Nov/2026:10:00:01 +0900] \"GET /routefly/c/frst-488205101-3f5aca\" 301 - \"" + g + "\"",
                    "203.0.113.5 [08/Nov/2026:10:00:02 +0900] \"GET /routefly/c/frst-462300101-000000\" 404 120 \"" + g + "\"",
                    "203.0.113.7 [08/Nov/2026:10:01:00 +0900] \"GET /routefly/c/frst-462300101-000001\" 404 120 \"" + m + "\"",
                    "203.0.113.7 [08/Nov/2026:10:02:00 +0900] \"GET /routefly/m/%EC%97%B0%ED%99%94%EC%82%B0\" 200 9000 \"" + m + "\"",
                    "203.0.113.9 [08/Nov/2026:10:03:00 +0900] \"GET /routefly/wp-login.php\" 404 50 \"" + m + "\"",
                    "203.0.113.7 [08/Nov/2026:10:04:00 +0900] \"GET /routefly/hike.html\" 304 - \"" + m + "\"") + "\n", StandardCharsets.UTF_8);
            Assume.assumeTrue("python3 없음 - 건너뜀", pythonOk());
            Process p = new ProcessBuilder("python3", "-I", py.toString(), log.toString(), "00:00", "24:00").redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            assertEquals(out, 0, p.waitFor());
            assertTrue(out, out.contains("[넘김 · 오류 응답 - 상태 · 경로 묶음 · 합계 · 검색 로봇 · 구글봇]"));
            assertTrue("/c/ 404 둘, 그중 구글봇 하나", java.util.regex.Pattern.compile(" 404 +/c/ +2 +1 +1\\n").matcher(out).find());
            assertTrue("/c/ 301 하나(구글봇)", java.util.regex.Pattern.compile(" 301 +/c/ +1 +1 +1\\n").matcher(out).find());
            assertTrue("남이 만든 주소는 묶음 이름만", java.util.regex.Pattern.compile(" 404 +그 밖 +1 +0 +0\\n").matcher(out).find() && !out.contains("wp-login"));
            assertFalse("코스 번호 · 주소는 안 나옴", out.contains("frst-") || out.contains("203.0.113"));
            assertTrue("화면 수는 예전대로 400 미만(200 · 301 · 304)", out.contains("화면 합계 3"));
        } finally {
            new File(py.toString()).delete();
            new File(log.toString()).delete();
        }
    }

    /** 옛 아이폰 흉내(iOS 13.2.3 · Safari 13.0.3 - UA 는 StatsTest 와 같은 실제 접속 기록 글)는 앱 통계(Stats.UA_FIXED_CHROME)처럼 사람으로 세지 않음(2026-11-10 PC 보고). */
    @Test
    public void oldIphoneLookalikeIsNotHuman() throws Exception {
        String sh = new String(Files.readAllBytes(Path.of("tools/log-key/routefly-logs-read")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int a = sh.indexOf("<<'PY'\n") + 7, b = sh.indexOf("\nPY\n", a);
        Path py = Files.createTempFile("access", ".py"), log = Files.createTempFile("access", ".txt");
        try {
            Files.writeString(py, sh.substring(a, b + 1), StandardCharsets.UTF_8);
            String ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
                    now = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";   // 위 시험의 안드로이드 크롬
            Files.writeString(log, String.join("\n",
                    "203.0.113.5 [10/Nov/2026:01:00:01 +0900] \"GET /routefly/m/%EC%97%B0%ED%99%94%EC%82%B0\" 200 9000 \"" + ios + "\"",
                    "203.0.113.7 [10/Nov/2026:01:00:02 +0900] \"GET /routefly/hike.html\" 200 9000 \"" + now + "\"") + "\n", StandardCharsets.UTF_8);
            Assume.assumeTrue("python3 없음 - 건너뜀", pythonOk());
            Process p = new ProcessBuilder("python3", "-I", py.toString(), log.toString(), "00:00", "24:00").redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            assertEquals(out, 0, p.waitFor());
            assertTrue(out, java.util.regex.Pattern.compile(" +1 +0 +옛 아이폰 흉내\\(iOS 13\\.2\\.3\\)\\n").matcher(out).find());
            assertTrue("요즘 브라우저는 그대로 사람", java.util.regex.Pattern.compile(" +1 +0 +사람 브라우저\\n").matcher(out).find());
        } finally {
            new File(py.toString()).delete();
            new File(log.toString()).delete();
        }
    }
}
