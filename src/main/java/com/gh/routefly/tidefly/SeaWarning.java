package com.gh.routefly.tidefly;

import java.util.ArrayList;
import java.util.List;

/**
 * 지금 특보 한 줄(API허브 wrn_now_data.php). 칸 차례는 응답 머리말(2026-11-14 실제 응답):
 * REG_UP · REG_UP_KO · REG_ID · REG_KO · TM_FC · TM_EF(KST) · WRN(종류) · LVL(수준) · CMD(명령) · ED_TM.
 */
record SeaWarning(String regUp, String regId, String regKo, String tmFc, String tmEf, String kind, String level, String cmd) {

    /** 받은 실제 응답에 있던 예비특보의 수준 값. */
    static final String PRELIM = "예비";

    boolean prelim() {
        return PRELIM.equals(level);
    }

    /** 순수 함수 - 응답 글 → 해상(S 로 시작하는 구역) 특보들. 오류 안내 글이면 null. */
    static List<SeaWarning> parse(String text) {
        List<String[]> rows = KmaText.rows(text);
        if (rows == null) return null;
        List<SeaWarning> out = new ArrayList<>();
        for (String[] f : rows) {
            if (f.length < 9 || !f[2].startsWith("S")) continue;
            out.add(new SeaWarning(f[0], f[2], f[3], f[4], f[5], f[6], f[7], f[8]));
        }
        return out;
    }
}
