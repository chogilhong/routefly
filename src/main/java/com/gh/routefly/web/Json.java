package com.gh.routefly.web;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Timestamp;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

/** SELECT 결과 → JSON, JSON 응답 쓰기(investing 의 OverviewServlet 안 도우미를 여러 서블릿이 쓰게 뺀 것). */
final class Json {

    private Json() {
    }

    /** SELECT 결과를 JSON 줄 목록으로. 숫자는 숫자, 시각은 "yyyy-MM-dd HH:mm:ss" 문자열. */
    static JsonArray rows(Connection c, String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                JsonArray out = new JsonArray();
                while (rs.next()) {
                    JsonObject row = new JsonObject();
                    for (int i = 1; i <= md.getColumnCount(); i++) {
                        row.add(md.getColumnLabel(i), value(rs.getObject(i)));
                    }
                    out.add(row);
                }
                return out;
            }
        }
    }

    static JsonElement value(Object v) {
        if (v == null) return JsonNull.INSTANCE;
        if (v instanceof BigDecimal) return new JsonPrimitive((BigDecimal) v);
        if (v instanceof Number) return new JsonPrimitive((Number) v);
        if (v instanceof Timestamp) return new JsonPrimitive(((Timestamp) v).toLocalDateTime().toString().replace('T', ' '));
        if (v instanceof java.time.LocalDateTime) return new JsonPrimitive(v.toString().replace('T', ' '));
        return new JsonPrimitive(String.valueOf(v));
    }

    /** 실패 응답 {success:false, message}. */
    static void fail(HttpServletResponse resp, int status, String message) throws IOException {
        JsonObject out = new JsonObject();
        out.addProperty("success", false);
        out.addProperty("message", message);
        write(resp, status, out, false);
    }

    /**
     * JSON 응답. 코스 자료는 배치가 1시간마다 바꾸는 공개 자료라 짧게(5분) 캐시하게 둡니다.
     * 실패 응답은 캐시하지 않습니다.
     */
    /**
     * 2026-10-09 점검: 성공(200) 코스 자료 - ETag 를 붙이고, 브라우저 · 서비스 워커가 같은 ETag 로 다시 물으면 304(본문 없음).
     * 서비스 워커가 늘 서버에 다시 확인(no-cache)하므로, 바뀌지 않은 자료는 산속 느린 통신에서도 몇 바이트만 오갑니다.
     * gzip 으로 바뀌어 나갈 수 있어 약한 ETag(W/) 입니다.
     */
    static void ok(HttpServletRequest req, HttpServletResponse resp, JsonObject body) throws IOException {
        String text = body.toString(), tag = etag(text);
        resp.setHeader("ETag", tag);
        resp.setHeader("Cache-Control", "public, max-age=300");
        if (matches(req.getHeader("If-None-Match"), tag)) {
            resp.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json;charset=UTF-8");
        resp.getWriter().write(text);
    }

    /** 순수 함수 - 본문의 약한 ETag(SHA-256 앞 16바이트). */
    static String etag(String text) {
        try {
            byte[] h = java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "W/\"" + java.util.HexFormat.of().formatHex(h, 0, 16) + "\"";
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 순수 함수 - If-None-Match(쉼표로 여럿 · * · 강한/약한 표시 무시)에 tag 가 있는가. */
    static boolean matches(String ifNoneMatch, String tag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) return false;
        String want = tag.startsWith("W/") ? tag.substring(2) : tag;
        for (String t : ifNoneMatch.split(",")) {
            t = t.trim();
            if (t.equals("*")) return true;
            if (t.startsWith("W/")) t = t.substring(2);
            // gzip 을 거친 응답에 톰캣 · 프록시가 붙이는 꼬리(-gzip)도 같은 것으로
            if (t.equals(want) || t.equals(want.substring(0, want.length() - 1) + "-gzip\"")) return true;
        }
        return false;
    }

    static void write(HttpServletResponse resp, int status, JsonObject body, boolean cacheable) throws IOException {
        resp.setStatus(status);
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", cacheable ? "public, max-age=300" : "no-store");
        resp.getWriter().write(body.toString());
    }
}
