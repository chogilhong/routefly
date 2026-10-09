package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

/** 2026-10-09 보안 - 공유 링크 주소, 요청한 곳, 요청 횟수 제한. */
public class SecurityTest {

    @Test
    public void shareBaseUrlDoesNotTrustForwardedHost() {
        // 설정이 있으면 그것
        assertEquals("https://routefly.example.kr/routefly", ShareServlet.baseUrl("https://routefly.example.kr/routefly/", "http", "evil.com", 80, "/routefly", null));
        // 없으면 요청 Host(Cloudflare 터널은 https 로 넘겨 줌), 이상한 글자는 지움
        assertEquals("https://abc.trycloudflare.com/routefly", ShareServlet.baseUrl(null, "http", "abc.trycloudflare.com", 8080, "/routefly", "https"));
        assertEquals("http://localhost:8080/routefly", ShareServlet.baseUrl(null, "http", "localhost", 8080, "/routefly", null));
        assertEquals("http://evil.comx/routefly", ShareServlet.baseUrl(null, "http", "evil.com/x\"<", 80, "/routefly", null));   // / " < 같은 글자는 빠짐
        assertEquals("http://localhost:8080/routefly", ShareServlet.baseUrl("javascript:alert(1)", "http", "localhost", 8080, "/routefly", "gopher"));
    }

    @Test
    public void clientIpTrustsHeadersOnlyFromThisComputer() {
        assertEquals("1.2.3.4", SecurityFilter.clientIp("1.2.3.4", "9.9.9.9", "8.8.8.8"));          // 밖에서 바로 - 머리글 무시
        assertEquals("9.9.9.9", SecurityFilter.clientIp("127.0.0.1", "9.9.9.9", "8.8.8.8"));        // 터널 - Cloudflare 가 알려 준 곳
        // nginx 가 붙인 맨 뒤 값 - 맨 앞(8.8.8.8)은 요청한 쪽이 꾸밀 수 있음(2026-10-09 점검)
        assertEquals("10.0.0.1", SecurityFilter.clientIp("0:0:0:0:0:0:0:1", null, "8.8.8.8, 10.0.0.1"));
        assertEquals("10.0.0.1", SecurityFilter.clientIp("127.0.0.1", "", "10.0.0.1"));
        assertEquals("127.0.0.1", SecurityFilter.clientIp("127.0.0.1", null, null));
    }

    @Test
    public void rateLimiterAllowsBurstThenRefills() {
        RateLimiter r = new RateLimiter(5, 2);   // 한꺼번에 5번, 1초 2번
        long t = 1_000_000;
        for (int i = 0; i < 5; i++) assertTrue(r.allow("a", t));
        assertFalse(r.allow("a", t));
        assertTrue("다른 곳은 따로", r.allow("b", t));
        assertTrue("0.5초 뒤 하나 찼음", r.allow("a", t + 500));
        assertFalse(r.allow("a", t + 500));
        r.allow("z", t + 200_000);   // 2분 넘게 안 온 곳은 지워짐
        assertEquals(1, r.size());
    }
}
