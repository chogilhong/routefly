package com.gh.routefly.web;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 안드로이드 앱 링크 확인 파일(2026-10-20 홍TV님) - 산악회 방 참가 링크를 routefly 앱(kr.routefly.app)이 바로 열게.
 * 안드로이드는 https://routefly.kr/.well-known/assetlinks.json 을 보므로 nginx 가 사이트 뿌리의 그 주소를 이리로 넘김(docs/deploy-lightsail.md 15).
 * 앱 서명 지문(SHA-256, 공개 값)은 설정 app.sha256(쉼표로 여럿 - 시험판 debug 키 · 업로드 키 · Play 앱 서명 키). 없으면 404.
 */
@WebServlet(urlPatterns = {"/.well-known/assetlinks.json"})
public class AssetLinksServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String APP_ID = "kr.routefly.app";

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        List<String> fp = fingerprints(RouteflyConfig.get("app.sha256"));
        if (fp.isEmpty()) { resp.sendError(HttpServletResponse.SC_NOT_FOUND); return; }
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "max-age=3600");
        resp.getWriter().print(body(fp));
    }

    /** 순수 함수 - 설정 글에서 올바른 지문만(AB:CD:… 32바이트, 대문자로). */
    static List<String> fingerprints(String conf) {
        List<String> out = new ArrayList<>();
        if (conf == null) return out;
        for (String s : conf.split("[,\\s]+")) {
            String t = s.trim().toUpperCase();
            if (t.matches("([0-9A-F]{2}:){31}[0-9A-F]{2}") && !out.contains(t)) out.add(t);
        }
        return out;
    }

    /** 순수 함수 - assetlinks.json 본문. */
    static String body(List<String> fp) {
        JsonObject target = new JsonObject();
        target.addProperty("namespace", "android_app");
        target.addProperty("package_name", APP_ID);
        JsonArray prints = new JsonArray();
        fp.forEach(prints::add);
        target.add("sha256_cert_fingerprints", prints);
        JsonObject one = new JsonObject();
        JsonArray rel = new JsonArray();
        rel.add("delegate_permission/common.handle_all_urls");
        one.add("relation", rel);
        one.add("target", target);
        JsonArray all = new JsonArray();
        all.add(one);
        return all.toString();
    }
}
