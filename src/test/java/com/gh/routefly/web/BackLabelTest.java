package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.Test;

/**
 * 2026-11-02 홍TV님 "어떤 건 '돌아가기' 어떤 건 '뒤로' 이런 것도 통일해줘":
 * 앞 화면으로 가는 단추 · 고리는 "‹ 뒤로"(영어 "‹ Back"), 갈 곳 이름이 붙은 단추도 같은 화살표 "‹"("‹ 산 모음" · "‹ 사무실" · "‹ 목록" …).
 * 화면 html · js(만든 kit-*.js · vendor 빼고)와 서버가 만드는 화면(java)의 단추 글에 옛 글("돌아가기" · "Go back" · "← …")이 남으면 실패.
 * 주석과 도움말 문장("코스로 돌아가는 길" 등)은 보지 않음 - 따옴표나 > 바로 뒤에 오는 단추 글만.
 */
public class BackLabelTest {

    /** 단추 글로 쓰인 옛 모양: "돌아가기" · "‹ 돌아가기" · "Go back" · "← 무엇". */
    private static final Pattern OLD = Pattern.compile("[\"'>]\\s*(‹\\s*)?(돌아가기|Go back)\\s*[\"'<]|[\"'>]← ");

    /** 주석을 빼고 남은 줄 - 한 줄 /* … *&#47; · &lt;!-- … --&gt; · 빈칸 뒤 // …(주소 "https://" 는 그대로). */
    static String code(String line) {
        String s = line.replaceAll("/\\*.*?\\*/", "").replaceAll("<!--.*?-->", "").replaceAll("(^|\\s)//.*$", "");
        String t = s.trim();
        return t.startsWith("*") || t.startsWith("/*") ? "" : s;
    }

    static List<String> oldLabels(Path root, String glob) throws Exception {
        List<String> bad = new ArrayList<>();
        var m = root.getFileSystem().getPathMatcher("glob:" + glob);
        try (Stream<Path> st = Files.walk(root)) {
            for (Path p : (Iterable<Path>) st.filter(Files::isRegularFile)::iterator) {
                String rel = root.relativize(p).toString().replace('\\', '/');
                if (!m.matches(Path.of(rel)) || rel.startsWith("vendor/") || rel.matches("js/kit-[a-z]+\\.js")) continue;
                List<String> lines = Files.readAllLines(p, StandardCharsets.UTF_8);
                for (int i = 0; i < lines.size(); i++)
                    if (OLD.matcher(code(lines.get(i))).find()) bad.add(rel + ":" + (i + 1) + " " + lines.get(i).trim());
            }
        }
        return bad;
    }

    @Test
    public void noOldBackLabels() throws Exception {
        List<String> bad = new ArrayList<>();
        bad.addAll(oldLabels(Path.of("src/main/webapp"), "**.html"));
        bad.addAll(oldLabels(Path.of("src/main/webapp"), "js/*.js"));
        bad.addAll(oldLabels(Path.of("src/main/java"), "**.java"));
        assertTrue("뒤로 단추는 \"‹ 뒤로\" · 화살표는 ‹ :\n" + String.join("\n", bad), bad.isEmpty());
    }

    /** 검사가 단추 글만 잡는지 - 옛 단추 글은 잡고, 문장 · 주석 · 다른 화살표는 그대로. */
    @Test
    public void checkIsPrecise() {
        assertTrue(OLD.matcher(code("<a id=\"fbBack\">‹ 돌아가기</a>")).find());
        assertTrue(OLD.matcher(code("cancel: T(\"돌아가기\", \"Go back\")")).find());
        assertTrue(OLD.matcher(code("$(\"back\").textContent = T(\"← 뒤로\", \"← Back\");")).find());
        assertTrue(OLD.matcher(code("<a id=\"back\" href=\"m/\">← 산 모음</a>")).find());
        assertFalse(OLD.matcher(code("say(T(\"코스로 돌아가는 길입니다.\", \"Back to the trail.\"));")).find());
        assertFalse(OLD.matcher(code("var x = 1;   // 3D 의 \"← 뒤로\" 가 이 화면으로")).find());
        assertFalse(OLD.matcher(code("/* 아래 '‹ 돌아가기' 와 같음 */")).find());
        assertFalse(OLD.matcher(code("var arrows = [\"↓\", \"↙\", \"←\", \"↖\"];")).find());
        assertFalse(OLD.matcher(code("<b>산 · 영시암 → 수렴동</b>")).find());
    }

    @Test
    public void newLabels() throws Exception {
        String app = Files.readString(Path.of("src/main/webapp/js/app.js"), StandardCharsets.UTF_8);
        assertTrue("3D 화면", app.contains("T(\"‹ 뒤로\", \"‹ Back\") : T(\"‹ 따라가기\", \"‹ Follow\")"));
        String party = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8);
        assertTrue("산행 취소 사유 창", party.contains("cancel: T(\"‹ 뒤로\", \"‹ Back\")"));
        for (String f : new String[] {"about.html", "privacy.html", "terms.html", "lbs-terms.html", "feedback.html", "anbu.html", "tools.html", "route.html", "studio.html", "party-office.html"})
            assertTrue(f, Files.readString(Path.of("src/main/webapp", f), StandardCharsets.UTF_8).contains(">‹ 뒤로</a>"));
    }
}
