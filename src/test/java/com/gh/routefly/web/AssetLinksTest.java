package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

/** 앱 링크 확인 파일(2026-10-20) - 지문 고르기 · 본문 모양. 지문 값은 시험용 가짜. */
public class AssetLinksTest {

    static final String A = "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF";

    @Test
    public void fingerprints() {
        assertTrue(AssetLinksServlet.fingerprints(null).isEmpty());
        assertTrue("모양이 틀리면 버림", AssetLinksServlet.fingerprints("AB:CD").isEmpty());
        List<String> f = AssetLinksServlet.fingerprints(" " + A.toLowerCase() + " , " + A + ",x");
        assertEquals("소문자도 받고 같은 것은 한 번", List.of(A), f);
        String b = AssetLinksServlet.body(f);
        assertTrue(b.contains("\"package_name\":\"kr.routefly.app\"") && b.contains("delegate_permission/common.handle_all_urls") && b.contains(A));
    }
}
