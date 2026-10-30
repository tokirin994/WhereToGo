package com.travelatlas.library;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.travelatlas.places.PlaceService;
import com.travelatlas.security.CurrentUser;
import com.travelatlas.trips.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RouteApplyTest {
    @Test @SuppressWarnings({"unchecked","rawtypes"}) void loadsItineraryOnlyAfterJdbcAppend()throws Exception{
        JdbcTemplate jdbc=mock(JdbcTemplate.class);CurrentUser user=mock(CurrentUser.class);TripService trips=mock(TripService.class);
        UUID owner=UUID.randomUUID(),routeId=UUID.randomUUID(),tripId=UUID.randomUUID();when(user.id()).thenReturn(owner);
        String payload="{\"name\":\"sample\",\"city\":\"sample\",\"waypoints\":[{\"name\":\"A\"},{\"name\":\"B\"}]}";
        when(jdbc.queryForList(anyString(),eq(String.class),eq(routeId),eq(owner))).thenReturn(Collections.singletonList(payload));
        when(jdbc.query(anyString(),any(RowMapper.class),eq(tripId),eq(owner))).thenReturn(Collections.singletonList(new LocalDate[]{LocalDate.of(2026,11,10),LocalDate.of(2026,11,11)}));
        when(jdbc.queryForObject(startsWith("SELECT count"),eq(Integer.class),eq(tripId))).thenReturn(1);
        when(jdbc.queryForObject(startsWith("SELECT COALESCE"),eq(Integer.class),eq(tripId))).thenReturn(0);
        TripDto refreshed=new TripDto();when(trips.find(tripId)).thenReturn(refreshed);
        RouteController controller=new RouteController(jdbc,user,new ObjectMapper(),mock(PlaceService.class),trips);
        RouteController.ApplyInput input=new RouteController.ApplyInput();input.tripId=tripId;input.date=LocalDate.of(2026,11,10);input.startsAt="10:00";input.minutesPerStop=30;
        assertSame(refreshed,controller.apply(routeId,input));
        InOrder ordered=inOrder(jdbc,trips);ordered.verify(jdbc).update(startsWith("UPDATE trips"),eq(tripId),eq(owner));ordered.verify(trips).find(tripId);
        verify(trips,times(1)).find(tripId);
    }
}
