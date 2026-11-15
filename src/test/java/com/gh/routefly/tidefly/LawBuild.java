package com.gh.routefly.tidefly;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonObject;

/**
 * 금어기 · 금지 체장(테스트가 아님 - 파일을 씀, 네트워크 안 씀). 2026-11-15 홍TV님 "둘째(금어기) 작업 하고 공식 자료로만".
 * 수산자원관리법 시행령 별표 1(포획 · 채취 금지 기간 · 구역 및 수심) · 별표 2(금지 체장 또는 체중) 원문(src/test/resources/tidefly/law/ - 2026-07-01 시행판)을
 * data/tidefly-law.json {종 이름: {closed: 원문, from: "MM-DD", to: "MM-DD", plain: 단서 없음, size: 원문}} 으로.
 * from · to 는 원문이 "M월 D일부터 (다음 해) M월 D일까지" 로 시작할 때만(구역 · 고시 기간 · 해마다 다른 것은 글만 - 지어내지 않음).
 */
public final class LawBuild {

    private LawBuild() {
    }

    static final Path DIR = PointsBuild.RES.resolve("law");
    static final Path OUT = Path.of("src", "main", "webapp", "data", "tidefly-law.json");
    public static void main(String[] args) throws Exception {
        Files.writeString(OUT, build(Files.readString(DIR.resolve("closed-season.tsv"), StandardCharsets.UTF_8),
                Files.readString(DIR.resolve("min-size.tsv"), StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
        System.out.println("→ " + OUT.toAbsolutePath());
    }

    private static final Pattern PERIOD = Pattern.compile("^(\\d{1,2})월 (\\d{1,2})일부터 (?:다음 해 )?(\\d{1,2})월 (\\d{1,2})일까지(?!의)");   // "…까지의 기간 중 1개월"(고등어)은 날짜가 아님

    /** 순수 함수 - 원문 기간 → [from "MM-DD", to "MM-DD", 단서 없음 "1"/"0"]. 그 꼴로 시작하지 않으면 null. */
    static String[] period(String text) {
        Matcher m = PERIOD.matcher(text == null ? "" : text.trim());
        if (!m.find()) return null;
        String rest = text.trim().substring(m.end()).trim();
        return new String[] {String.format("%02d-%02d", Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))),
                String.format("%02d-%02d", Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4))), rest.isEmpty() ? "1" : "0"};
    }

    /** 순수 함수 - tsv(머리 줄 + species · 원문 칸) 두 개 → json 글(종 이름 차례, 한 줄에 한 종). */
    static String build(String closedTsv, String sizeTsv) {
        Map<String, JsonObject> out = new TreeMap<>();
        for (String[] r : rows(closedTsv)) {
            JsonObject o = out.computeIfAbsent(r[0], k -> new JsonObject());
            o.addProperty("closed", r[1]);
            String[] p = period(r[1]);
            if (p != null) {
                o.addProperty("from", p[0]);
                o.addProperty("to", p[1]);
                o.addProperty("plain", "1".equals(p[2]));
            }
        }
        for (String[] r : rows(sizeTsv)) out.computeIfAbsent(r[0], k -> new JsonObject()).addProperty("size", r[1]);
        StringBuilder b = new StringBuilder("{\n");
        int i = 0;
        for (Map.Entry<String, JsonObject> e : out.entrySet()) {
            b.append(new com.google.gson.JsonPrimitive(e.getKey())).append(':').append(e.getValue()).append(++i < out.size() ? ",\n" : "\n");
        }
        return b.append("}\n").toString();
    }

    private static List<String[]> rows(String tsv) {
        List<String> lines = List.of(tsv.replace("\r\n", "\n").split("\n"));
        return lines.subList(1, lines.size()).stream().filter(l -> !l.isBlank()).map(l -> l.split("\t", -1)).toList();
    }
}
