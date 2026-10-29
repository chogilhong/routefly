package com.gh.routefly.web;

/**
 * 구글 애드센스 광고 자리(2026-10-28 홍TV님 "만들어" - 수익원). 산 페이지(/m/ · /en/m/)와 코스 소개 페이지(/c/)에만.
 * 따라가기 · 산악회 방 · 회사 사무실 · SOS 화면에는 넣지 않음(안전 화면에 광고가 끼면 신뢰를 잃음). 앱(웹뷰)에서는 js/ads.js 가 지움(애드센스는 웹용).
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
        String h = box(RouteflyConfig.get("adsense.client"), RouteflyConfig.get("adsense.slot." + where));
        return en ? h.replace("aria-label=\"광고\"><p class=\"adNote\">광고</p>", "aria-label=\"Ad\"><p class=\"adNote\">Ad</p>") : h;
    }

    /** 순수 함수 - 광고 자리 HTML("광고" 표시 + 애드센스 칸). 꼴이 틀리면 "". */
    static String box(String client, String slot) {
        if (client == null || slot == null || !CLIENT.matcher(client.trim()).matches() || !SLOT.matcher(slot.trim()).matches()) return "";
        return "<aside class=\"adBox\" aria-label=\"광고\"><p class=\"adNote\">광고</p><ins class=\"adsbygoogle\" style=\"display:block\" data-ad-client=\"" + client.trim()
                + "\" data-ad-slot=\"" + slot.trim() + "\" data-ad-format=\"auto\" data-full-width-responsive=\"true\"></ins></aside>"
                + "<script src=\"" + MountainServlet.REL + "/js/ads.js\" defer></script>";   // 광고 칸이 있을 때만 - 우리 파일(앱이면 칸을 지움)
    }
}
