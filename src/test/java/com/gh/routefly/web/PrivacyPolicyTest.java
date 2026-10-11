package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 2026-10-11 개인정보처리방침(privacy.html)에 적은 약속이 코드 · 배포 설정과 맞는지.
 * 방침을 고치거나 아래 코드를 바꾸면 둘을 함께 맞춥니다.
 */
public class PrivacyPolicyTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void policyMatchesCode() throws Exception {
        String policy = read("src/main/webapp/privacy.html");
        // "내 주변 코스" 는 약 1km 칸으로 뭉갠 자리만 보냄
        assertTrue(policy.contains("약 1km 칸으로 뭉갠 자리"));
        assertTrue(read("src/main/webapp/js/hike.js").contains("var qlat = Math.round(lat * 100) / 100, qlon = Math.round(lon * 100) / 100;"));
        // 접속 기록에 ?뒤를 남기지 않고 14 · 30일
        String deploy = read("docs/deploy-lightsail.md");
        assertTrue(deploy.contains("access_log /var/log/nginx/access.log routefly_noargs;"));
        assertTrue(deploy.contains("pattern=\"%h %t &quot;%m %U&quot; %s %b\" maxDays=\"30\""));
        assertTrue(policy.contains("14일 뒤 자동 삭제") && policy.contains("30일 뒤 자동 삭제"));
        // 요청 횟수는 2분 쉬면 지움(RateLimiter.sweep idle 120초)
        assertTrue(policy.contains("2분 동안 요청이 없으면"));
        assertTrue(read("src/main/java/com/gh/routefly/web/RateLimiter.java").contains("long idle = full ? 10_000 : 120_000;"));
        // 앱 백업에 기록을 넣지 않음
        assertTrue(policy.contains("앱은 핸드폰 백업에 이 정보를 넣지 않습니다"));
        assertTrue(read("app/android/app/src/main/AndroidManifest.xml").contains("android:allowBackup=\"false\""));
    }

    @Test
    public void policyIsLinked() throws Exception {
        assertTrue(read("src/main/webapp/about.html").contains("href=\"privacy.html\""));
        assertTrue(read("src/main/webapp/hike.html").contains("href=\"privacy.html\""));
        assertTrue("오프라인에서도", read("src/main/webapp/sw.js").contains("\"privacy.html\""));
    }
}
