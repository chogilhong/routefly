package com.gh.routefly.web;

/**
 * 구글 애드센스 광고 자리(2026-10-28 홍TV님 "만들어" - 수익원). 산 페이지(/m/ · /en/m/)와 코스 소개 페이지(/c/)에만.
 * 따라가기 지도 · SOS 화면에는 넣지 않음(안전 화면에 광고가 끼면 신뢰를 잃음). PC 넓은 화면 양옆(rails)은 따라가기 첫 화면(코스 목록) · 산악회 방 · 회사 사무실 등에도(2026-11-24 홍TV님 - CLAUDE.md 광고 줄). 앱(웹뷰)에서는 js/ads.js 가 지움(애드센스는 웹용).
 * 광고 ID 는 운영 설정에만: adsense.client(ca-pub-…) · adsense.slot.m(산 페이지) · adsense.slot.c(코스 페이지). 비어 있으면 아무것도 안 나감.
 * 애드센스 스크립트는 화면에 넣지 않고, 광고 칸과 함께 붙는 js/ads.js(우리 파일)가 앱이 아닐 때만 불러옴(CSP script-src 'self' - 화면 안 스크립트 없음).
 */
final class Ads {

    private Ads() {
    }

    private static final java.util.regex.Pattern CLIENT = java.util.regex.Pattern.compile("ca-pub-\\d{10,20}"), SLOT = java.util.regex.Pattern.compile("\\d{6,12}");

    /** 설정의 광고 자리(where = m · c). 설정이 없거나 꼴이 틀리면 "". */
    static String box(String where) {
        return box(where, false);
    }

    /** 영어 산 페이지(/en/m/, 2026-10-29 점검 - 숙소를 예약할 외국 손님 화면에 광고가 없었음)는 표시만 "Ad". */
    static String box(String where, boolean en) {
        // 영어 산 페이지는 한 단 더 깊음(/en/m/ - ../..) - ads.js 주소를 그 깊이로(2026-11-24 PC: ../js/ads.js 가 /en/js/ads.js 404 였음)
        String h = box(RouteflyConfig.get("adsense.client"), RouteflyConfig.get("adsense.slot." + where), en ? MountainEn.REL : MountainServlet.REL);
        return en ? h.replace("aria-label=\"광고\"><p class=\"adNote\">광고</p>", "aria-label=\"Ad\"><p class=\"adNote\">Ad</p>") : h;
    }

    /** 순수 함수 - 광고 자리 HTML("광고" 표시 + 애드센스 칸). 꼴이 틀리면 "". 한국어 산 · 코스 페이지 깊이(..). */
    static String box(String client, String slot) {
        return box(client, slot, MountainServlet.REL);
    }

    /** rel - 화면에서 웹앱 뿌리까지 상대 주소(한국어 "..", 영어 "../.."). */
    static String box(String client, String slot, String rel) {
        if (client == null || slot == null || !CLIENT.matcher(client.trim()).matches() || !SLOT.matcher(slot.trim()).matches()) return "";
        return "<aside class=\"adBox\" aria-label=\"광고\"><p class=\"adNote\">광고</p><ins class=\"adsbygoogle\" style=\"display:block\" data-ad-client=\"" + client.trim()
                + "\" data-ad-slot=\"" + slot.trim() + "\" data-ad-format=\"auto\" data-full-width-responsive=\"true\"></ins></aside>"
                + "<script src=\"" + rel + "/" + AssetVersion.of("js/ads.js") + "\" defer></script>";   // 광고 칸이 있을 때만 - 우리 파일(앱이면 칸을 지움)
    }

    /**
     * PC 넓은 화면의 양옆 광고 자리(2026-11-24 홍TV님 "pc 에서만 사이드에 광고 - 공간이 충분하잖아. 앱(폰)에서는 광고를 붙히지 않고") - 코스 모음(/m/ · /en/m/) 첫 화면.
     * 빈 자리 둘만 두고 js/ads.js 가 화면이 1200px 넘을 때만 api/ad?where=side 로 설정을 받아 칸을 만듦(폰 · 태블릿 · 앱은 지움). 설정 adsense.slot.side(없으면 adsense.slot.m).
     */
    static String rails() {
        return rails(MountainServlet.REL);
    }

    /** 영어 산 페이지 · 코스 모음(/en/m/ - 한 단 더 깊음)은 rel "../.."(MountainEn.REL). */
    static String rails(String rel) {
        return "<div class=\"adSpot adRail left\" data-where=\"side\"></div><div class=\"adSpot adRail right\" data-where=\"side\"></div>"
                + "<script src=\"" + rel + "/" + AssetVersion.of("js/ads.js") + "\" defer></script>";
    }

    /**
     * 정적 화면(도구 tools.html · 도장 series.html - 2026-11-01 홍TV님)의 광고 칸 설정 - js/ads.js 가 api/ad 로 받아 칸을 만듦.
     * adsense.slot.<where> 가 없으면 산 페이지 칸(adsense.slot.m)을 같이 씀. 설정이 없거나 꼴이 틀리면 빈 객체(광고 없음).
     */
    static com.google.gson.JsonObject spot(String where, java.util.function.Function<String, String> cfg) {
        com.google.gson.JsonObject o = new com.google.gson.JsonObject();
        if (where == null || !where.matches("tools|series|side")) return o;
        String client = cfg.apply("adsense.client"), slot = cfg.apply("adsense.slot." + where);
        if (slot == null || slot.isBlank()) slot = cfg.apply("adsense.slot.m");
        if (client == null || slot == null || !CLIENT.matcher(client.trim()).matches() || !SLOT.matcher(slot.trim()).matches()) return o;
        o.addProperty("client", client.trim());
        o.addProperty("slot", slot.trim());
        return o;
    }
}
