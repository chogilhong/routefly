package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 기록 보기(trip.html) 단추 정리(2026-11-25 홍TV님): 코스 보기(?c=)의 🛩 3D 영상은 미리보기가 아니라 촬영(처음 · 끝 안 자름),
 * 🥾 따라가기는 코스 목록 줄에 있어 코스 보기에서는 뺌, 📂 GPX 열기로 연 파일에는 🥾 따라가기 - 뒤로 오면 같은 파일을 다시 보여 줌.
 */
public class TripOpenFollowTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 코스_보기_촬영_연_파일_따라가기() throws Exception {
        String tj = read("src/main/webapp/js/trip.js"), ck = read("src/main/webapp/js/course-kit.js");
        assertTrue("코스 보기 3D 영상은 촬영, 공개 코스라 처음 · 끝 안 자름",
            tj.contains("$(\"rec-fly\").onclick = function () { flyFile(got, true); };") && ck.contains("function flyStart(rec, en, keepEnds) {")
            && ck.contains("tr = keepEnds ? all : trimEnds(all, FLY_TRIM_M);"));
        assertFalse("코스 보기는 3D 미리보기 · 따라가기 단추를 쓰지 않음", tj.contains("\"index.html\" + cQ + \"&from=hike\"") || tj.contains("(EN ? \"hike.html?lang=en\" : \"hike.html\") + cQ"));
        assertTrue("연 GPX 파일은 이 기기 GPX 로 따라가기",
            tj.contains("$(\"rec-go\").hidden = false;") && tj.contains("try { RF.storeGpx(id, RF.gpxToApi(text, f.name)); }")
            && tj.contains("location.href = (EN ? \"hike.html?lang=en\" : \"hike.html\") + \"#c=\" + encodeURIComponent(id) + \"&from=trip\";")
            && read("src/main/webapp/js/hike.js").contains("if (fromTrip) { location.href = (EN ? \"trip.html?lang=en\" : \"trip.html\") + \"#open\"; return; }"));
        assertTrue("뒤로 오면 같은 파일(#open + 이 탭 sessionStorage)",
            tj.contains("try { sessionStorage.setItem(OPEN_KEY, JSON.stringify({ name: name, text: text })); history.replaceState(null, \"\", \"#open\"); return true; }")
            && tj.contains("if (!recParam && !courseParam && location.hash === \"#open\") {")
            && tj.contains("if (back && back.text) openText(back.text, back.name);"));
        assertTrue("기록 보기에서 촬영하면 저장 뒤 그 화면으로(rf-vid-back, 15분 · trip.html 만) - 2026-11-25 홍TV님 \"그냥 그 자리에 있어\"",
            tj.contains("$(\"rec-fly\").onclick = function () { flyFile(got, false, keepOpen(text, f.name) ? \"#open\" : \"\"); };")
            && tj.contains("}).then(function () { vidBack(hash); location.href = f.url; });") && tj.contains("if (k === \"fly\") vidBack();")
            && read("src/main/webapp/js/hike.js").contains("if (back) setTimeout(function () { location.href = back; }, 1500);")
            && read("src/main/webapp/js/hike.js").contains("return b && Date.now() - b.t < 15 * 60000 && /^trip\\.html(\\?[^#]*)?(#open)?$/.test(String(b.u)) ? b.u : null;"));
        assertTrue("만든 영상(#vid)은 걷던 산행 이어 열기로 덮지 않음 - 💾 저장 창이 뜸(2026-11-25 PC)",
            read("src/main/webapp/js/hike.js").contains("&& !/^#(recdo|coursegpx)=/.test(location.hash) && location.hash !== \"#vid\") {"));
    }
}
