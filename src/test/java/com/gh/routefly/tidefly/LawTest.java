package com.gh.routefly.tidefly;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 금어기 · 금지 체장(2026-11-15 홍TV님 "공식 자료로만") - 수산자원관리법 시행령 별표 1 · 2 원문(src/test/resources/tidefly/law) 그대로인지. */
public class LawTest {

    @Test
    public void law_json_은_별표_원문으로_다시_만든_것과_같음() throws Exception {
        String now = Files.readString(LawBuild.OUT, StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertEquals("별표 tsv 가 바뀌었으면 tidefly.LawBuild 를 다시 돌려 커밋", LawBuild.build(Files.readString(LawBuild.DIR.resolve("closed-season.tsv"), StandardCharsets.UTF_8),
                Files.readString(LawBuild.DIR.resolve("min-size.tsv"), StandardCharsets.UTF_8)), now);
        JsonObject o = JsonParser.parseString(now).getAsJsonObject();
        JsonObject j = o.getAsJsonObject("주꾸미");
        assertEquals("5월 11일부터 8월 31일까지", j.get("closed").getAsString());
        assertEquals("05-11", j.get("from").getAsString());
        assertEquals("08-31", j.get("to").getAsString());
        assertTrue(j.get("plain").getAsBoolean());
        assertEquals("25센티미터 이하", o.getAsJsonObject("감성돔").get("size").getAsString());
        assertFalse("다만 · 고시 단서", o.getAsJsonObject("쥐노래미").get("plain").getAsBoolean());
        assertFalse("구역부터 쓰인 갈치는 날짜로 읽지 않음", o.getAsJsonObject("갈치").has("from"));
        assertFalse("고등어 \"…까지의 기간 중 1개월\" 은 날짜가 아님", o.getAsJsonObject("고등어").has("from"));
    }

    @Test
    public void 기간_읽기() {
        assertArrayEquals(new String[] {"10-01", "01-31", "1"}, LawBuild.period("10월 1일부터 다음 해 1월 31일까지"));
        assertArrayEquals(new String[] {"05-16", "06-30", "0"}, LawBuild.period("5월 16일부터 6월 30일까지. 다만, 시·도지사가 …"));
        assertNull(LawBuild.period("4월 1일부터 6월 30일까지의 기간 중 1개월의 범위에서 해양수산부장관이 정하여 고시하는 기간"));
        assertNull(LawBuild.period("제주특별자치도에 한정하여 7월 1일부터 8월 31일까지"));
    }
}
