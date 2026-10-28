package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 기기 사이 기록 옮기기(2026-10-28 홍TV님 "qr 로 옮겨줘" - 폰의 지리산 인증이 PC 에 없음).
 * 받는 기기(PC)가 코드를 만들어 QR · 글로 보여 주고, 보내는 기기(폰)가 그 코드로 기록 백업을 <b>암호화해</b> 조각으로 올림 → 받는 기기가 가져가 풀어서 합침.
 * 코드는 기기 안에서만 - 서버에는 코드의 해시(id)와 암호문만 옴(열쇠는 코드에서 만들어 서버가 내용을 볼 수 없음). 10분 · 한 번 가져가면 지움 · 메모리에만.
 * <pre>
 * POST /api/xfer/open {id}                 받는 기기 - 자리 만들기
 * POST /api/xfer/put  {id, i, n, part}     보내는 기기 - 조각 i/n(조각마다 PART_MAX 글자까지, nginx 본문 한도 아래로)
 * POST /api/xfer/take {id}                 받는 기기 - 다 왔으면 {data} 를 주고 지움, 아니면 {waiting, got, n}
 * </pre>
 */
@WebServlet(urlPatterns = {"/api/xfer/*"})
public class XferServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final long TTL_MS = 10 * 60_000L;
    static final int MAX_SLOTS = 300, PART_MAX = 600_000, MAX_PARTS = 60;   // 조각 60개 × 60만 글자 ≈ 36MB(사진 많은 백업)
    private static final java.util.regex.Pattern ID = java.util.regex.Pattern.compile("[0-9a-f]{32}");

    static final class Slot {
        final long created;
        String[] parts;
        int got;
        Slot(long created) { this.created = created; }
    }

    static final Map<String, Slot> SLOTS = new LinkedHashMap<>();
    /** 자리 만들기 - IP 마다 1시간에 20번. */
    static final PartyServlet.Quota OPENS = new PartyServlet.Quota(20, 3600_000L);

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        String path = req.getPathInfo(), ip = RateLimiter.group(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        long now = System.currentTimeMillis();
        if ("/open".equals(path) && OPENS.over(ip, now)) { Json.fail(resp, 429, "잠시 뒤 다시 해 주세요."); return; }
        JsonObject in;
        try {
            in = body(req.getInputStream(), PART_MAX + 4096);
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        try {
            JsonObject out = handle(path, in, now);
            if ("/open".equals(path)) OPENS.take(ip, now);
            Json.write(resp, 200, out, false);
        } catch (IllegalArgumentException | IllegalStateException e) {
            Json.fail(resp, 400, e.getMessage());
        } catch (RuntimeException e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
        }
    }

    /** 처리(시험이 시각을 넣음). */
    static JsonObject handle(String path, JsonObject in, long now) {
        String id = str(in, "id");
        if (id == null || !ID.matcher(id).matches()) throw new IllegalArgumentException("코드가 올바르지 않습니다.");
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        synchronized (SLOTS) {
            SLOTS.values().removeIf(s -> now - s.created > TTL_MS);
            Slot s = SLOTS.get(id);
            switch (path == null ? "" : path) {
                case "/open" -> {
                    if (SLOTS.size() >= MAX_SLOTS) throw new IllegalStateException("지금은 옮기기가 많습니다. 잠시 뒤 다시 해 주세요.");
                    SLOTS.put(id, new Slot(now));
                    out.addProperty("ttl", TTL_MS / 1000);
                }
                case "/put" -> {
                    if (s == null) throw new IllegalArgumentException("받는 기기의 코드를 찾지 못했습니다. 받는 기기에서 QR 을 다시 띄워 주세요(10분 안).");
                    int i = num(in, "i"), n = num(in, "n");
                    String part = str(in, "part");
                    if (n < 1 || n > MAX_PARTS || i < 0 || i >= n || part == null || part.length() > PART_MAX || !part.matches("[A-Za-z0-9+/=]*"))
                        throw new IllegalArgumentException("기록이 너무 크거나 올바르지 않습니다.");
                    if (s.parts == null) s.parts = new String[n];
                    if (s.parts.length != n) throw new IllegalArgumentException("조각 수가 맞지 않습니다. 처음부터 다시 보내 주세요.");
                    if (s.parts[i] == null) s.got++;
                    s.parts[i] = part;
                    out.addProperty("got", s.got);
                }
                case "/take" -> {
                    if (s == null) throw new IllegalArgumentException("시간이 지났습니다. QR 을 다시 띄워 주세요.");
                    if (s.parts == null || s.got < s.parts.length) {
                        out.addProperty("waiting", true);
                        out.addProperty("got", s.got);
                        if (s.parts != null) out.addProperty("n", s.parts.length);
                    } else {
                        out.addProperty("data", String.join("", s.parts));
                        SLOTS.remove(id);   // 한 번 가져가면 지움
                    }
                }
                default -> throw new IllegalArgumentException("없는 주소입니다.");
            }
        }
        return out;
    }

    private static JsonObject body(InputStream is, int max) throws IOException {
        byte[] b = is.readNBytes(max + 1);
        if (b.length > max) throw new IOException("too large");
        return JsonParser.parseString(new String(b, StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static String str(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    private static int num(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isNumber() ? e.getAsInt() : -1;
    }
}
