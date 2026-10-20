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
 * 산악회 방 API(Party - 2026-10-20 홍TV님). 열쇠(token)는 주소가 아니라 본문으로(접속 기록에 남지 않게), 응답은 저장하지 않음(no-store).
 * <pre>
 * GET  /api/party/status                          {enabled}
 * POST /api/party/create {name, endAt}             인솔자 → 방 + 열쇠
 * POST /api/party/join   {code, nick, role, agree} 회원(hiker) · 운전자(driver) → 열쇠 - agree(위치 제공 동의)가 true 여야
 * POST /api/party/loc    {token, lat, lon, acc, batt, sos} 내 위치 → 방 상태
 * POST /api/party/view   {token}                   방 상태만(인솔자 · 운전자는 회원 위치까지)
 * POST /api/party/aboard {token, on}               버스 탑승(하산)
 * POST /api/party/notice {token, text}             인솔자 공지
 * POST /api/party/bus    {token, lat, lon}         인솔자 · 운전자 - 버스 자리
 * POST /api/party/leave  {token} · /end {token}    나가기 · (인솔자) 방 끝내기 - 위치를 모두 지움
 * </pre>
 * 설정 party.enabled=true 가 아니면 status 말고는 404(위치기반서비스사업 신고 전에는 닫아 둠).
 */
@WebServlet(urlPatterns = {"/api/party/*"})
public class PartyServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static boolean enabled() {
        return "true".equalsIgnoreCase(RouteflyConfig.get("party.enabled"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"/status".equals(req.getPathInfo())) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("enabled", enabled());
        Json.write(resp, 200, o, false);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!enabled()) { Json.fail(resp, 404, "산악회 방은 준비 중입니다."); return; }
        JsonObject in;
        try {
            in = body(req);
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        try {
            Json.write(resp, 200, handle(Party.STORE, req.getPathInfo(), in, System.currentTimeMillis()), false);
        } catch (IllegalArgumentException | IllegalStateException e) {
            Json.fail(resp, 400, e.getMessage());
        } catch (SecurityException e) {
            Json.fail(resp, 403, e.getMessage());
        }
    }

    /** 본문 JSON(4KB 까지). */
    private static JsonObject body(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[1024];
        BufferedReader r = req.getReader();
        for (int n; (n = r.read(buf)) > 0;) {
            sb.append(buf, 0, n);
            if (sb.length() > 4096) throw new IOException("too large");
        }
        return JsonParser.parseString(sb.toString()).getAsJsonObject();
    }

    /** 순수에 가까운 처리(시험이 store · 시각을 넣음). 잘못된 값 → IllegalArgumentException, 권한 없음 → SecurityException. */
    static JsonObject handle(Party p, String path, JsonObject in, long now) {
        if ("/create".equals(path)) {
            Party.Member lead = p.create(str(in, "name"), num(in, "endAt") == null ? 0 : num(in, "endAt").longValue(), now);
            return withToken(p.full(lead, now), lead);
        }
        if ("/join".equals(path)) {
            if (!in.has("agree") || !in.get("agree").getAsBoolean()) throw new IllegalArgumentException("위치 제공에 동의해야 참가할 수 있습니다.");
            Party.Member m = p.join(str(in, "code"), str(in, "nick"), str(in, "role"), now);
            return withToken(view(p, m, now), m);
        }
        Party.Member m = p.who(str(in, "token"), now);
        if (m == null) throw new IllegalArgumentException("방이 끝났거나 열쇠가 맞지 않습니다.");
        boolean lead = "lead".equals(m.role), staff = lead || "driver".equals(m.role);
        switch (path == null ? "" : path) {
            case "/loc" -> p.loc(m, num(in, "lat"), num(in, "lon"), num(in, "acc"), num(in, "batt") == null ? null : num(in, "batt").intValue(),
                    in.has("sos") && in.get("sos").getAsBoolean(), now);
            case "/view" -> { }
            case "/aboard" -> p.aboard(m, in.has("on") && in.get("on").getAsBoolean());
            case "/notice" -> { if (!lead) throw new SecurityException("인솔자만 공지할 수 있습니다."); p.notice(m, str(in, "text"), now); }
            case "/bus" -> { if (!staff) throw new SecurityException("인솔자 · 운전자만 버스 자리를 정할 수 있습니다."); p.bus(m, num(in, "lat"), num(in, "lon")); }
            case "/leave" -> { p.leave(m); return ok(); }
            case "/end" -> { if (!lead) throw new SecurityException("인솔자만 방을 끝낼 수 있습니다."); p.end(m); return ok(); }
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        return view(p, m, now);
    }

    private static JsonObject view(Party p, Party.Member m, long now) {
        return "lead".equals(m.role) || "driver".equals(m.role) ? p.full(m, now) : p.common(m, now);
    }

    private static JsonObject withToken(JsonObject o, Party.Member m) {
        o.addProperty("token", m.token);
        return o;
    }

    private static JsonObject ok() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        return o;
    }

    private static String str(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    private static Double num(JsonObject in, String k) {
        JsonElement e = in.get(k);
        if (e == null || e.isJsonNull() || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) return null;
        double v = e.getAsDouble();
        return Double.isFinite(v) ? v : null;
    }
}
