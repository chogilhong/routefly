package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 의견 보내기 API(2026-10-20 홍TV님). {@code POST /api/feedback {text, page, reply}} → {success}. 운영자 메일 + 파일(Feedback).
 */
@WebServlet(urlPatterns = {"/api/feedback"})
public class FeedbackServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        // JSON 으로 보낸 것만 - 다른 누리집이 손님 브라우저로 몰래 보내 하루 200통을 다 쓰거나 메일함을 채우지 못하게(점검)
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        JsonObject in;
        try {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[1024];
            BufferedReader r = req.getReader();
            for (int n; (n = r.read(buf)) > 0;) {
                sb.append(buf, 0, n);
                if (sb.length() > 8192) throw new IOException("too large");
            }
            in = JsonParser.parseString(sb.toString()).getAsJsonObject();
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        // IPv6 는 /64 로 묶어 셈(2026-10-28 보안 점검: 주소를 바꿔 가며 하루 전체 한도 200건을 혼자 채울 수 있었음)
        String ip = RateLimiter.group(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        try {
            Json.write(resp, 200, handle(Feedback.STORE, in, ip, System.currentTimeMillis()), false);
        } catch (IllegalArgumentException e) {
            Json.fail(resp, 400, e.getMessage());
        } catch (IllegalStateException e) {
            Json.fail(resp, 429, e.getMessage());
        }
    }

    /** 처리(시험이 store · 시각을 넣음). 잘못된 값 → IllegalArgumentException, 너무 자주 → IllegalStateException. */
    static JsonObject handle(Feedback f, JsonObject in, String ip, long now) {
        String text = Feedback.text(str(in, "text")), reply = Feedback.reply(str(in, "reply")), page = Feedback.page(str(in, "page"));
        if (!f.allow(ip, now)) throw new IllegalStateException("잠시 뒤 다시 보내 주세요(10분에 3번까지).");
        f.add(text, page, reply, now);
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        return o;
    }

    private static String str(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }
}
