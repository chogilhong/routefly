package com.gh.routefly.web;

import java.io.IOException;
import java.util.function.UnaryOperator;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 제휴 · 후원 링크. {@code GET /api/partners} - 설정에 넣은 링크만 내려 줍니다(비어 있으면 화면에 안 보임). 2026-10-15 홍TV님.
 *
 * <ul>
 *   <li>{@code partner.coupang.<물건>} - 쿠팡 파트너스 링크(link.coupang.com · coupa.ng). 물건은 {@link #GEAR}.
 *       한 물건에 여러 개면 쉼표로(앞의 COUPANG_MAX 개까지) → 응답은 물건마다 주소 배열.
 *       화면은 링크 아래에 공정위가 정한 "수수료를 받습니다" 문구를 붙입니다.</li>
 *   <li>{@code partner.agoda.url} - 아고다 제휴 링크(www.agoda.com). 안에 {lat} · {lon} 이 있으면 들머리 좌표로 바꿉니다.</li>
 *   <li>{@code donate.url} - 후원(toss.me · qr.kakaopay.com 등 https 주소).</li>
 *   <li>{@code donate.en.url} - 외국 사람용 후원(PayPal 결제 링크 · paypal.me · ko-fi.com) - 영어 페이지(/en/m/)에만. 2026-10-17 홍TV님.</li>
 * </ul>
 * 가입 · 링크 만들기는 홍TV님이 하고, 링크는 설정에만 둡니다. 주소는 정해진 곳(https)만 받습니다 - 설정이 잘못돼도 엉뚱한 곳으로 보내지 않게.
 */
@WebServlet(urlPatterns = {"/api/partners"})
public class PartnersServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    /** 한 물건에 보일 쿠팡 링크 수. */
    static final int COUPANG_MAX = 3;
    /** 쿠팡 링크를 붙일 수 있는 물건(설정 열쇠 partner.coupang.&lt;이것&gt;) - course-kit.js gearList 의 key 와 같음. */
    static final String[] GEAR = {"water", "rain", "headlamp", "battery", "firstaid", "shoes", "pack", "stick", "knee", "sun", "warm", "crampon", "glove"};

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Json.ok(req, resp, body(RouteflyConfig::get));
    }

    /** 순수 함수 - 응답 본문. conf 는 설정 읽기(열쇠 → 값, 없으면 null). */
    static JsonObject body(UnaryOperator<String> conf) {
        JsonObject out = new JsonObject(), coupang = new JsonObject();
        out.addProperty("success", true);
        for (String g : GEAR) {
            String v = conf.apply("partner.coupang." + g);
            if (v == null) continue;
            JsonArray urls = new JsonArray();
            for (String u : v.split(",")) {
                u = u.trim();
                if (urls.size() < COUPANG_MAX && allowed(u, "https://link.coupang.com/", "https://coupa.ng/")) urls.add(u);
            }
            if (urls.size() > 0) coupang.add(g, urls);
        }
        out.add("coupang", coupang);
        String agoda = conf.apply("partner.agoda.url");
        if (allowed(agoda, "https://www.agoda.com/")) out.addProperty("agoda", agoda);
        String donate = conf.apply("donate.url");
        if (allowed(donate, "https://")) out.addProperty("donate", donate);
        String donateEn = conf.apply("donate.en.url");
        if (allowed(donateEn, "https://www.paypal.com/", "https://paypal.me/", "https://www.paypal.me/", "https://ko-fi.com/")) out.addProperty("donateEn", donateEn);
        return out;
    }

    /** 순수 함수 - 그 앞부분으로 시작하는 https 주소이고 따옴표 · 꺾쇠 · 빈칸이 없으면 true. */
    static boolean allowed(String url, String... prefixes) {
        if (url == null || url.length() > 500 || url.matches(".*[\\s\"'<>\\\\].*")) return false;
        for (String p : prefixes) if (url.startsWith(p) && url.length() > p.length()) return true;
        return false;
    }
}
