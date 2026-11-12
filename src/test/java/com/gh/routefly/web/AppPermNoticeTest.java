package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 앱 접근권한 사전 안내(js/app-perm.js, 2026-11-10 원스토어 검증 의견 "접근권한(위치)을 요구하나 이용자에게 사전 고지 및 동의 절차가 구현되어 있지 않습니다").
 * 앱이 처음 열 수 있는 화면마다 붙었는지(앱은 처음에 코스 모음 m/ 으로 열림 - early.js), 앱 안에서만 · 처음 한 번인지, 권한 글이 스토어 권한설명과 같은 항목인지.
 */
public class AppPermNoticeTest {

    static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void everyEntryPageLoadsIt() throws Exception {
        for (String page : new String[] {"hike", "party", "party-office", "anbu", "tools"})
            assertTrue(page + ".html", read("src/main/webapp/" + page + ".html").contains("<script src=\"js/app-perm.js\"></script>"));
        // 코스 모음 · 산 페이지 · 코스 페이지(서버가 만드는 화면 - 앱의 첫 화면)와 영어 산 페이지
        assertTrue(MountainServlet.foot(null, true).contains("js/app-perm.js"));
        assertTrue(MountainServlet.foot(null, false).contains("js/app-perm.js"));
        assertTrue(read("src/main/java/com/gh/routefly/web/MountainEn.java").contains("AssetVersion.of(\"js/app-perm.js\")"));
        assertTrue("신호 없을 때도(서비스 워커)", read("src/main/webapp/sw.js").contains("\"js/app-perm.js\""));
    }

    @Test
    public void appOnlyOnceAndListsPermissions() throws Exception {
        String js = read("src/main/webapp/js/app-perm.js");
        assertTrue("앱 안에서만", js.contains("if (isApp() && !seen())"));
        // 2026-11-12 점검: 앱 첫 화면(/m/ · /en/m/ · /c/)에서 상대 주소 "privacy.html" 이 404 - 스크립트 자리 기준으로
        assertTrue("방침 링크는 스크립트 자리 기준", js.contains("a.href = here(en() ? \"privacy-en.html\" : \"privacy.html\");")
            && js.contains("SRC.replace(/js\\/app-perm\\.js(\\?.*)?$/, file)"));
        assertTrue("확인하면 다시 안 뜸", js.contains("localStorage.setItem(KEY, \"1\")"));
        for (String w : new String[] {"위치(정확한 · 대략적인 위치)", "화면이 꺼진 동안 위치", "알림", "정한 시각 알림", "NFC", "선택 접근권한", "설정 → 애플리케이션 → routefly → 권한"})
            assertTrue(w, js.contains(w));
        // 스토어 권한설명(docs/store-onestore.md)과 같은 말 - 회원끼리는 위치를 못 봄
        assertTrue(js.contains("인솔자에게 내 위치(회사가 올린 방이면 그 회사 사무실도)"));
        assertTrue(read("docs/store-onestore.md").contains("인솔자에게 내 위치(회사가 올린 방이면 그 회사 사무실도"));
    }
}
