package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import org.junit.After;
import org.junit.Assume;
import org.junit.Test;

/**
 * js · css 주소 판(?v=내용 해시, 2026-11-01 점검 - 화면마다 js · css 20여 개를 서버에 304 로 묻던 것)과 화면별 작은 course-kit(길 · 시리즈 · 국립공원).
 * war 를 만들 때 tools/minify/version.js 가 판을 붙이고 WEB-INF/asset-versions.json 을 씀 → AssetVersion · NoStaleFilter · sw.js.
 */
public class AssetVersionTest {

    private static final String IMMUTABLE = "public, max-age=31536000, immutable";

    @After
    public void noTable() {
        AssetVersion.load(null);   // 다른 시험은 표 없이(이클립스와 같음)
    }

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void tableAddsVersionOnlyWhenPresent() {
        AssetVersion.load(null);
        assertEquals("표가 없으면 그대로(개발 · 이클립스)", "js/kit-m.js", AssetVersion.of("js/kit-m.js"));
        AssetVersion.load("{\"js/kit-m.js\": \"0123456789\", \"css/mountain.css\": \"abcdefabcd\", \"../x.js\": \"0123456789\", \"js/y.js\": \"<b>\"}");
        assertEquals("js/kit-m.js?v=0123456789", AssetVersion.of("js/kit-m.js"));
        assertEquals("css/mountain.css?v=abcdefabcd", AssetVersion.of("css/mountain.css"));
        assertEquals("표에 없는 파일은 그대로", "js/seen.js", AssetVersion.of("js/seen.js"));
        assertEquals("꼴이 틀린 칸은 뺌", "js/y.js", AssetVersion.of("js/y.js"));
        assertTrue(AssetVersion.current("js/kit-m.js", "0123456789"));
        assertFalse("예전 판", AssetVersion.current("js/kit-m.js", "9999999999"));
        assertFalse(AssetVersion.current("js/kit-m.js", null));
        AssetVersion.load("{깨진");
        assertEquals("깨진 표는 없는 것과 같음", "js/kit-m.js", AssetVersion.of("js/kit-m.js"));
    }

    @Test
    public void filterCachesOnlyCurrentVersionForAYear() {
        assertEquals("표가 없으면 ?v= 가 있어도 예전처럼", "no-cache", NoStaleFilter.cacheControl("/js/kit-m.js", "0123456789"));
        AssetVersion.load("{\"js/kit-m.js\": \"0123456789\"}");
        assertEquals(IMMUTABLE, NoStaleFilter.cacheControl("/js/kit-m.js", "0123456789"));
        assertEquals("예전 판 주소(배포 직후 옛 화면)는 지금 내용이 달라 묻기", "no-cache", NoStaleFilter.cacheControl("/js/kit-m.js", "9999999999"));
        assertEquals("판 없는 주소", "no-cache", NoStaleFilter.cacheControl("/js/kit-m.js", null));
        assertEquals("html 은 늘 묻기", "no-cache", NoStaleFilter.cacheControl("/hike.html", "0123456789"));
        assertEquals(IMMUTABLE, NoStaleFilter.cacheControl("/vendor/maplibre-gl-5.24.0/maplibre-gl.js", null));
        assertEquals("public, max-age=86400", NoStaleFilter.cacheControl("/img/icon-192.png", null));
        assertEquals("자료는 10분(2026-11-02)", "public, max-age=600", NoStaleFilter.cacheControl("/data/series.json", null));
    }

    @Test
    public void serverPagesUseSameVersions() {
        AssetVersion.load("{\"js/kit-m.js\": \"0123456789\", \"css/course-kit.css\": \"abcdefabcd\", \"js/seen.js\": \"1111111111\"}");
        for (String h : new String[] {MountainServlet.notFoundPage("x", "b"), MountainEn.notFoundPage("x", "b")}) {
            assertTrue(h, h.contains("/css/course-kit.css?v=abcdefabcd\"") && h.contains("/js/kit-m.js?v=0123456789\"") && h.contains("/js/seen.js?v=1111111111\""));
            assertTrue("표에 없는 파일은 그대로", h.contains("/css/mountain.css\""));
        }
        AssetVersion.load(null);
        assertTrue("표가 없으면 예전과 같음", MountainServlet.notFoundPage("x", "b").contains("<script src=\"../js/kit-m.js\"></script>"));
    }

    @Test
    public void serviceWorkerKeepsVersionedFilesFirst() throws Exception {
        String sw = read("src/main/webapp/sw.js");
        assertTrue("캐시 모양이 바뀌어 번호를 올림", sw.contains("var SHELL = \"rf-shell-v228\""));
        assertTrue(sw.contains("if (/\\/(?:js|css)\\/[^/?#]+\\.(?:js|css)\\?v=/.test(url)) { e.respondWith(versioned(e)); return; }"));
        assertTrue("서버가 지금 판이라 한 것만 담음", sw.contains("/immutable/.test(res.headers.get(\"Cache-Control\") || \"\")"));
        assertTrue("오프라인이면 ?없는 주소로 받아 둔 것", sw.contains("return caches.match(plain, { ignoreVary: true })"));
        String ps = read(".claude/build-war.ps1");
        assertTrue("esbuild 가 없어도 판은 붙임", ps.contains("if (Test-Path $node) {") && read("tools/minify/minify.js").contains("version.run(root)"));
    }

    @Test
    public void routeSeriesParkUseOwnKit() throws Exception {
        String sw = read("src/main/webapp/sw.js");
        for (String p : new String[] {"route", "series", "park"}) {
            String h = read("src/main/webapp/" + p + ".html");
            assertTrue(p, h.contains("<script src=\"js/kit-" + p + ".js\"></script>") && !h.contains("course-kit.js"));
            assertTrue(p + " 오프라인", sw.contains("\"js/kit-" + p + ".js\""));
        }
        // 2026-11-07 전체 점검 3단계: 따라가기 · 3D 도 제 것(kit-hike · kit-app) - course-kit.js 는 원본 · 테스트용
        for (String[] p : new String[][] {{"hike", "hike"}, {"index", "app"}}) {
            String h = read("src/main/webapp/" + p[0] + ".html");
            assertTrue(p[0], h.contains("<script src=\"js/kit-" + p[1] + ".js\"></script>") && !h.contains("course-kit.js"));
            assertTrue(p[0] + " 오프라인", sw.contains("\"js/kit-" + p[1] + ".js\""));
        }
        assertFalse("화면이 안 쓰는 원본은 받아 두지 않음", sw.contains("\"js/course-kit.js\""));
        assertTrue(read("tools/kit-split/split.js").contains("{ out: \"js/kit-park.js\", users: [\"park.html\", \"js/park.js\", \"js/seen.js\"] }"));
    }

    @Test
    public void versionScriptOnTempFolder() throws Exception {
        File script = new File("src/test/js/version.test.js");
        assertTrue(script.isFile());
        Process p;
        try {
            p = new ProcessBuilder("node", script.getPath()).redirectErrorStream(true).start();
        } catch (java.io.IOException e) {
            Assume.assumeNoException("node 가 없어 건너뜁니다", e);
            return;
        }
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertTrue("node 가 끝나지 않았습니다", p.waitFor(60, TimeUnit.SECONDS));
        assertEquals(out, 0, p.exitValue());
        assertTrue(out, out.contains("OK "));
    }
}
