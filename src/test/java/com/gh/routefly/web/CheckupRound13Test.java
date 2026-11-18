package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 점검 13차(2026-11-18 홍TV님 "1, 5 작업해주고" 1 - 오늘 만든 드론 · 출조 기능 점검). 순수 함수는 node 테스트(dronefly · tidefly · course-kit).
 * 여기는 화면 · 앱이 그 함수를 제대로 부르는지.
 */
public class CheckupRound13Test {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Path.of(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 점검13차() throws Exception {
        String dj = read("src/main/webapp/js/dronefly.js"), tj = read("src/main/webapp/js/tidefly.js");
        // 1 조과 CSV 불러오기가 사진을 지우지 않게 - 같은 배열로 견줌
        assertTrue(tj.contains("var old = catchList(), m = RF.mergeRows(old, add,") && tj.contains("catchGone(old, m.list).forEach("));
        // 2 · 3 점수는 같은 풀이를 바꿔 씀 · 링크로 연 풀이는 이어 자리를 바꾸지 않음
        assertTrue(dj.contains("run = { id: Date.now(),") && dj.contains("{ id: run.id, d: todayKst()") && !dj.contains("run.kept"));
        assertTrue(dj.contains("if (run.mode === 'all' && !run.jump) {") && dj.contains("if (!run || !run.n || run.jump) return;"));
        // 6 · 8 CSV 저장 · 읽기는 RF.saveCsvFile · RF.readCsvFile 하나로(앱은 공유 창, 2MB · EUC-KR), 저장한 날은 끝까지 간 때만
        assertTrue(dj.contains("RF.saveCsvFile(") && tj.contains("RF.saveCsvFile(") && dj.contains("RF.readCsvFile(f)") && tj.contains("RF.readCsvFile(f)"));
        assertTrue(dj.contains("if (done && !who) { save('df-log-saved'") && tj.contains("if (done) { save('tf-catch-saved', day);"));
        assertFalse("화면마다 따로 내려받기 코드가 남지 않음", dj.contains("a.download") || tj.contains("a.download"));
        for (String kit : new String[] {"kit-dronefly.js", "kit-tidefly.js"}) {
            String k = read("src/main/webapp/js/" + kit);
            assertTrue(kit, k.contains("function saveCsvFile(") && k.contains("function readCsvFile(") && k.contains("new TextDecoder(\"euc-kr\")") && k.contains("f.size > 2 * 1024 * 1024"));
        }
        // 7 앱 바로가기는 기록 중이면 화면을 바꾸지 않음(window.rfBusy)
        String ma = read("app/android/app/src/main/java/kr/routefly/app/MainActivity.java");
        assertTrue(ma.contains("evaluateJavascript(\"(window.rfBusy && window.rfBusy()) ? 1 : 0\""));
        assertTrue(read("src/main/webapp/js/hike.js").contains("window.rfBusy = function () { return !!hike.running; };"));
        assertTrue(read("src/main/webapp/js/party.js").contains("window.rfBusy = function () { return bgOn || watch != null; };"));
        // 10 초점 · 11 문항 페이지 404 · 빈 주소
        assertTrue(dj.contains("qt.tabIndex = -1;") && dj.contains("(nx || after).focus({ preventScroll: true })"));
        String qs = read("src/main/java/com/gh/routefly/web/DroneQuizServlet.java");
        assertTrue(qs.contains("if (id.isEmpty()) { resp.sendRedirect(base + \"/drone-quiz/c4\"); return; }") && qs.contains("/dronefly.html#quiz-c4"));
    }
}
