package com.gh.routefly.web;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import org.junit.Test;

/** 반려동물 동반 정보(TourAPI detailPetTour2) - 2026-10-14. 응답은 TourAPI 모양으로 만든 테스트 데이터. */
public class PetServletTest {

    @Test
    public void bodyKeepsKnownFieldsInOrder() {
        String t = "{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":{\"item\":[{\"contentid\":\"1\","
                + "\"acmpyNeedMtr\":\"목줄 착용<br>배변봉투\",\"acmpyPsblCpam\":\"소형견\",\"acmpyTypeCd\":\"일부구역 동반가능\",\"relaRntlPrdlst\":\"\",\"zzz\":\"모름\"}]}}}}";
        JsonArray pet = PetServlet.body(t).getAsJsonArray("pet");
        assertEquals(3, pet.size());
        assertEquals("동반 구분", pet.get(0).getAsJsonObject().get("k").getAsString());
        assertEquals("소형견", pet.get(1).getAsJsonObject().get("v").getAsString());
        assertEquals("목줄 착용 배변봉투", pet.get(2).getAsJsonObject().get("v").getAsString());
    }

    @Test
    public void bodyIgnoresCaseAndReportsUnknownFields() {
        JsonArray pet = PetServlet.body("{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":{\"item\":{\"acmpypsblcpam\":\"전 견종\"}}}}}").getAsJsonArray("pet");
        assertEquals("전 견종", pet.get(0).getAsJsonObject().get("v").getAsString());
        assertEquals("contentid,newField", PetServlet.body("{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":{\"item\":{\"contentid\":\"1\",\"newField\":\"x\"}}}}}").get("fields").getAsString());
    }

    @Test
    public void bodyEmptyAndErrors() {
        assertEquals(0, PetServlet.body("{\"response\":{\"header\":{\"resultCode\":\"0000\"},\"body\":{\"items\":\"\",\"totalCount\":0}}}").getAsJsonArray("pet").size());
        assertNull(PetServlet.body("{\"response\":{\"header\":{\"resultCode\":\"30\"}}}"));
        assertNull(PetServlet.body("<OpenAPI_ServiceResponse/>"));
    }

    @Test
    public void urlHasContentId() {
        String u = PetServlet.url(PetServlet.DEFAULT_URL, "k+/", "12345");
        assertTrue(u, u.contains("serviceKey=k%2B%2F") && u.contains("contentId=12345") && u.contains("detailPetTour2"));
    }
}
