package com.gh.routefly.tidefly;

import java.util.List;

/**
 * 소해구 예측 한 칸(API허브 marine_small_zone.php). 칸 차례는 응답 머리말(2026-11-14 실제 응답):
 * 1 TMA_FC · 2 TMA_EF(UTC) · 3 LZONE · 4 SZONE · 5 ~ 12 네 귀퉁이 · 13 WH_SIG(m) · 14 WVPRD_MAX(s) · 15 WVDR · 16 WS(m/s) · 17 WD
 * · 18 VS(m) · 19 RAIN(mm) · 20 TW(℃) · 21 SWELL(1 관심 · 2 주의 · 3 경계 · 4 위험) - 18 ~ 21 은 2026-07-01 00UTC 자료부터. 없는 값은 null.
 */
record SeaForecast(String tmFc, String tmEf, int lzone, int szone, Double waveM, Double wavePeriod, Double waveDir,
        Double windMs, Double windDir, Double visM, Double rainMm, Double waterC, Integer swell) {

    /** 순수 함수 - 응답 글 → 첫 자료 줄. 오류 안내 글이거나 칸이 모자라면 null. */
    static SeaForecast parse(String text) {
        List<String[]> rows = KmaText.rows(text);
        if (rows == null || rows.isEmpty() || rows.get(0).length < 17) return null;
        String[] f = rows.get(0);
        Double sw = KmaText.num(f, 20);
        try {
            return new SeaForecast(f[0], f[1], Integer.parseInt(f[2]), Integer.parseInt(f[3]), KmaText.num(f, 12), KmaText.num(f, 13),
                    KmaText.num(f, 14), KmaText.num(f, 15), KmaText.num(f, 16), KmaText.num(f, 17), KmaText.num(f, 18), KmaText.num(f, 19),
                    sw == null ? null : (int) Math.round(sw));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
