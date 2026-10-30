package com.travelatlas.library;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.travelatlas.places.PlaceService;
import com.travelatlas.security.*;
import com.travelatlas.trips.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RouteValidationTest {
    private MockMvc mvc(){return MockMvcBuilders.standaloneSetup(new RouteController(mock(JdbcTemplate.class),mock(CurrentUser.class),new ObjectMapper(),mock(PlaceService.class),mock(TripService.class))).setControllerAdvice(new ApiExceptionHandler()).build();}
    @Test void nestedEmptyWaypointsReturnBadRequestRatherThanBindingFailure()throws Exception{
        mvc().perform(post("/api/v1/library/imports").contentType(MediaType.APPLICATION_JSON).content("{\"places\":[],\"routes\":[{\"name\":\"sample\",\"city\":\"sample\",\"waypoints\":[]}]}")).andExpect(status().isBadRequest());
    }
    @Test void nestedNullWaypointAndBlankNameReturnBadRequest()throws Exception{
        mvc().perform(post("/api/v1/library/imports").contentType(MediaType.APPLICATION_JSON).content("{\"places\":[],\"routes\":[{\"name\":\"sample\",\"city\":\"sample\",\"waypoints\":[null,{\"name\":\"\"}]}]}")).andExpect(status().isBadRequest());
    }
    @Test void directRouteInvalidDistanceReturnsBadRequest()throws Exception{
        mvc().perform(post("/api/v1/library/routes").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"sample\",\"city\":\"sample\",\"distanceKm\":0,\"waypoints\":[{\"name\":\"A\"},{\"name\":\"B\"}]}")).andExpect(status().isBadRequest());
    }
    @Test void rednoteWhitelistRequiresHttpsExactHostAndNoCredentials(){
        assertTrue(MaterialController.validLink("https://www.xiaohongshu.com/explore/sample"));
        assertTrue(MaterialController.validLink("https://xhslink.com/a/sample"));
        assertFalse(MaterialController.validLink("https://www.xiaohongshu.com.attacker.example/explore/sample"));
        assertFalse(MaterialController.validLink("https://user:password@www.xiaohongshu.com/explore/sample"));
        assertFalse(MaterialController.validLink("http://www.xiaohongshu.com/explore/sample"));
        assertFalse(MaterialController.validLink("https://127.0.0.1/private"));
    }
}
