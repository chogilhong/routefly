package com.gh.routefly.tidefly;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 하루 만조 · 간조(국립해양조사원 조석예보(고, 저조) 15156018). 응답 모양은 2026-11-14 실제 응답(src/test/resources/portal/hghlw-DT_0018-*.json):
 * {header:{resultCode}, body:{items:{item:[{obsvtrNm, lot, lat, predcDt "yyyy-MM-dd HH:mm"(우리 시간), predcTdlvVl(cm), extrSe}]}}},
 * extrSe 1 오전 고조 · 2 오전 저조 · 3 오후 고조 · 4 오후 저조(명세). routefly TideServlet.parse 와 같은 읽기.
 */
record Tide(String station, List<Event> events) {

    /** 만조(high) 또는 간조 한 번. */
    record Event(String t, Double cm, boolean high) {
    }

    /** 순수 함수 - 그날 이어진 만조 · 간조 사이 가장 큰 높이 차(cm). 셀 수 없으면 0. 화면 js 의 "높이 차 최대" 와 같은 셈. */
    static double range(List<Event> day) {
        double r = 0;
        Event prev = null;
        for (Event e : day) {
            if (prev != null && prev.cm() != null && e.cm() != null && prev.high() != e.high()) r = Math.max(r, Math.abs(e.cm() - prev.cm()));
            prev = e;
        }
        return r;
    }

    /**
     * 순수 함수 - 물 세기 %: 오늘 높이 차 ÷ 앞으로 며칠(오늘 포함) 가운데 가장 큰 높이 차 × 100, 반올림(2026-11-15 홍TV님 "1~5 작업해" - 바다타임 "물 흐름 %" 항목 참고,
     * 셈은 우리 것이라 화면에 "15일 중 가장 센 날 대비" 로 밝힘). 셀 수 없으면 null.
     */
    static Integer flowPct(double today, List<Double> days) {
        double max = 0;
        for (Double d : days) if (d != null) max = Math.max(max, d);
        if (max <= 0 || today <= 0) return null;
        return (int) Math.round(today / max * 100);
    }

    /** 순수 함수 - 이틀 물때를 하나로(시각 차례). 둘 다 없으면 null. */
    static Tide join(Tide a, Tide b) {
        if (a == null) return b;
        if (b == null) return a;
        List<Event> all = new ArrayList<>(a.events());
        all.addAll(b.events());
        all.sort((x, y) -> x.t().compareTo(y.t()));
        return new Tide(a.station() != null ? a.station() : b.station(), all);
    }

    /** 순수 함수 - 응답 글 → 그날 물때. 결과 코드가 00 이 아니거나 모양이 다르면 null, 자료 없음(3)은 빈 목록. */
    static Tide parse(String text) {
        if (text == null) return null;
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            if (root.has("response")) root = root.getAsJsonObject("response");
            JsonObject head = root.getAsJsonObject("header");
            String code = head == null || !head.has("resultCode") ? null : head.get("resultCode").getAsString().trim();
            List<Event> out = new ArrayList<>();
            if ("3".equals(code) || "03".equals(code)) return new Tide(null, out);
            if (!"00".equals(code) && !"0".equals(code)) return null;
            JsonElement items = root.getAsJsonObject("body").get("items");
            if (items == null || !items.isJsonObject()) return new Tide(null, out);
            JsonElement it = items.getAsJsonObject().get("item");
            JsonArray list = it != null && it.isJsonArray() ? it.getAsJsonArray() : new JsonArray();
            if (it != null && it.isJsonObject()) list.add(it);
            String name = null;
            for (JsonElement e : list) {
                JsonObject o = e.getAsJsonObject();
                if (name == null && o.has("obsvtrNm")) name = o.get("obsvtrNm").getAsString().trim();
                String se = o.has("extrSe") ? o.get("extrSe").getAsString().trim() : "";
                Double cm;
                try {
                    cm = Double.parseDouble(o.get("predcTdlvVl").getAsString().trim());
                } catch (RuntimeException ex) {
                    cm = null;
                }
                out.add(new Event(o.get("predcDt").getAsString().trim(), cm, "1".equals(se) || "3".equals(se)));
            }
            out.sort((a, b) -> a.t().compareTo(b.t()));
            return new Tide(name, out);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
