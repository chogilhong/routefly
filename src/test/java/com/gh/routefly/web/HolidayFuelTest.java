package com.gh.routefly.web;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

/**
 * 🧰 별거 별거 - 공휴일(HolidayServlet) · 기름값(FuelServlet) 응답 읽기(2026-10-18). 네트워크 없이.
 * 응답 모양은 공개 안내 기준 - PC 가 HolidayProbe · FuelProbe 로 받은 실제 응답(src/test/resources/holiday · fuel)으로 다시 확인.
 */
public class HolidayFuelTest {

    @Test
    public void holidayItems() {
        String many = "{\"response\":{\"header\":{\"resultCode\":\"00\",\"resultMsg\":\"NORMAL SERVICE.\"},\"body\":{\"items\":{\"item\":["
                + "{\"dateKind\":\"01\",\"dateName\":\"개천절\",\"isHoliday\":\"Y\",\"locdate\":20261003,\"seq\":1},"
                + "{\"dateKind\":\"01\",\"dateName\":\"대체공휴일\",\"isHoliday\":\"Y\",\"locdate\":20261005,\"seq\":1},"
                + "{\"dateKind\":\"01\",\"dateName\":\"한글날\",\"isHoliday\":\"Y\",\"locdate\":20261009,\"seq\":1}]},\"numOfRows\":50,\"pageNo\":1,\"totalCount\":3}}}";
        JsonArray a = HolidayServlet.items(many);
        assertEquals(3, a.size());
        assertEquals("2026-10-05", a.get(1).getAsJsonObject().get("date").getAsString());
        assertEquals("대체공휴일", a.get(1).getAsJsonObject().get("name").getAsString());
        String one = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":{\"dateName\":\"광복절\",\"isHoliday\":\"Y\",\"locdate\":20260815}},\"totalCount\":1}}}";
        assertEquals("하나면 item 이 객체", "광복절", HolidayServlet.items(one).get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("공휴일 없는 달 - items 가 빈 글", 0, HolidayServlet.items("{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":\"\",\"totalCount\":0}}}").size());
        assertEquals("휴일 아닌 특일은 뺌", 0, HolidayServlet.items("{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":{\"dateName\":\"제헌절\",\"isHoliday\":\"N\",\"locdate\":20260717}}}}}").size());
        assertNull("키 오류", HolidayServlet.items("{\"response\":{\"header\":{\"resultCode\":\"30\",\"resultMsg\":\"SERVICE KEY IS NOT REGISTERED ERROR.\"}}}"));
        assertNull(HolidayServlet.items("<OpenAPI_ServiceResponse>"));
        assertTrue(HolidayServlet.url("https://x/getRestDeInfo", "a+b/c", 2026, 3).endsWith("?serviceKey=a%2Bb%2Fc&solYear=2026&solMonth=03&numOfRows=50&_type=json"));
    }

    @Test
    public void fuelOil() {
        JsonArray a = FuelServlet.oil("{\"RESULT\":{\"OIL\":[{\"TRADE_DT\":\"20261018\",\"PRODCD\":\"B027\",\"PRODNM\":\"휘발유\",\"PRICE\":\"1,689.53\",\"DIFF\":\"+0.52\"}]}}");
        JsonObject o = a.get(0).getAsJsonObject();
        assertEquals(1689.53, FuelServlet.num(o, "PRICE"), 1e-9);
        assertEquals(0.52, FuelServlet.num(o, "DIFF"), 1e-9);
        assertNull(FuelServlet.num(o, "NONE"));
        assertEquals(1700.0, FuelServlet.num(JsonParser.parseString("{\"PRICE\":1700}").getAsJsonObject(), "PRICE"), 1e-9);
        assertEquals("2026-10-18", FuelServlet.ymd("20261018"));
        assertNull(FuelServlet.oil("{\"RESULT\":{}}"));
        assertNull(FuelServlet.oil("<html>"));
        assertEquals("https://www.opinet.co.kr/api/lowTop10.do?out=json&code=k%2B1&prodcd=B027", FuelServlet.url(FuelServlet.DEFAULT_URL, "lowTop10.do", "&prodcd=B027", "k+1"));
        assertEquals("S-OIL", FuelServlet.BRANDS.get("SOL"));
    }
}
