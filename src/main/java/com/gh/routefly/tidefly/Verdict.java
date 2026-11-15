package com.gh.routefly.tidefly;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * 오늘 ○ / △ / ✕ (2026-11-14 홍TV님 "권하는 대로 해"). 공식 자료로만 정하고 파고 · 바람 숫자 기준은 두지 않습니다(숫자는 그대로 보여 줌).
 * <ul>
 *   <li>✕: 그 포인트의 해상 특보구역에 특보(예비특보 빼고), 또는 기상청 너울 위험예측 3(경계) · 4(위험)</li>
 *   <li>△: 예비특보, 또는 너울 2(주의)</li>
 *   <li>○: 그 밖</li>
 *   <li>판단하지 않음(mark null): 특보구역 짝이 확인 전이거나, 예측을 받지 못했을 때 - 특보를 놓쳐 ○ 를 주지 않으려고</li>
 * </ul>
 * 선상 자리에는 늘 "출항은 선사에 확인" 을 덧붙입니다.
 */
record Verdict(String mark, List<String> reasons) {

    static final String OK = "○";
    static final String CARE = "△";
    static final String NO = "✕";

    /** 화면에 밝힐 기준 글. */
    static final String BASIS = "✕ 특보 · 너울 경계 이상, △ 예비특보 · 너울 주의, ○ 그 밖 (기상청 특보 · 너울 위험예측 기준)";

    /**
     * 순수 함수.
     * @param regIds 그 포인트의 해상 특보구역 코드들(확인된 짝). null 이면 짝이 아직 없음
     * @param warnings 지금 해상 특보 전체. null 이면 받지 못함
     */
    static Verdict judge(boolean boat, Collection<String> regIds, List<SeaWarning> warnings, SeaForecast sea) {
        List<String> why = new ArrayList<>();
        String mark = null;
        if (regIds == null || regIds.isEmpty()) why.add("특보구역 연결 확인 전 - 판단하지 않음");
        else if (warnings == null) why.add("특보를 받지 못함 - 판단하지 않음");
        else if (sea == null) why.add("파고 예측을 받지 못함 - 판단하지 않음");
        else {
            mark = OK;
            for (SeaWarning w : warnings) {
                if (!regIds.contains(w.regId()) && !regIds.contains(w.regUp())) continue;
                if (w.prelim()) {
                    mark = worse(mark, CARE);
                    why.add(w.regKo() + " " + w.kind() + " 예비특보");
                } else {
                    mark = NO;
                    why.add(w.regKo() + " " + w.kind() + (w.level() == null || w.level().isEmpty() ? "" : " " + w.level()));
                }
            }
            Integer s = sea.swell();
            if (s != null && s >= 3) {
                mark = NO;
                why.add(s == 3 ? "너울 경계" : "너울 위험");
            } else if (s != null && s == 2) {
                mark = worse(mark, CARE);
                why.add("너울 주의");
            }
        }
        if (boat) why.add("출항은 선사에 확인");
        return new Verdict(mark, why);
    }

    private static String worse(String a, String b) {
        if (NO.equals(a) || NO.equals(b)) return NO;
        if (CARE.equals(a) || CARE.equals(b)) return CARE;
        return OK;
    }
}
