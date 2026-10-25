package com.travelatlas.trips;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.travelatlas.places.*;
import com.travelatlas.security.CurrentUser;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class TripPlannerControllerTest {
    final UUID id=UUID.randomUUID(),placeId=UUID.randomUUID();
    final TripService trips=mock(TripService.class);final PlaceService places=mock(PlaceService.class);final CurrentUser user=mock(CurrentUser.class);final AiGateway ai=mock(AiGateway.class);
    TripPlannerController setup(){
        TripDto trip=mock(TripDto.class);when(trip.getId()).thenReturn(id);when(trip.getStartsOn()).thenReturn(LocalDate.of(2026,11,1));when(trip.getEndsOn()).thenReturn(LocalDate.of(2026,11,3));when(trip.getDestination()).thenReturn("杭州");when(trip.getPreferences()).thenReturn(new TripPreferences());when(trips.find(id)).thenReturn(trip);
        PlaceDto place=mock(PlaceDto.class);when(place.getId()).thenReturn(placeId);when(place.getName()).thenReturn("已收藏地点");when(place.getCity()).thenReturn("杭州");when(place.getCategory()).thenReturn("景点");when(places.findAll(null,null,null)).thenReturn(Collections.singletonList(place));when(user.id()).thenReturn(UUID.randomUUID());when(ai.configured()).thenReturn(true);
        // Use a real serializable trip for AI context, including the Java time module.
        ObjectMapper json=new ObjectMapper();json.findAndRegisterModules();
        TripDto stored=new TripDto();stored.setId(id);stored.setName("旅行");stored.setDestination("杭州");stored.setStartsOn(LocalDate.of(2026,11,1));stored.setEndsOn(LocalDate.of(2026,11,3));stored.setPreferences(new TripPreferences());stored.setStops(new ArrayList<>());when(trips.find(id)).thenReturn(stored);
        return new TripPlannerController(trips,places,user,json,ai);
    }
    TripPlannerController.Input input(){TripPlannerController.Input input=new TripPlannerController.Input();input.strategy="ai";return input;}
    String proposal(String selected,String date){return "{\"stops\":[{\"placeId\":\""+selected+"\",\"dayDate\":\""+date+"\",\"startsAt\":\"09:00\",\"durationMinutes\":60,\"note\":\"请核对预约\"}]}";}
    @Test void validAiDraftUsesServerOwnedNamesWithoutPersisting(){TripPlannerController controller=setup();when(ai.generate(anyString(),anyString())).thenReturn(proposal(placeId.toString(),"2026-11-01"));TripPlannerController.Draft draft=controller.draft(id,input());assertEquals("已收藏地点",draft.stops.get(0).getPlaceName());verify(trips,never()).replaceStops(any(),any());}
    @Test void rejectsForeignPlaces(){TripPlannerController controller=setup();when(ai.generate(anyString(),anyString())).thenReturn(proposal(UUID.randomUUID().toString(),"2026-11-01"));assertThrows(Exception.class,()->controller.draft(id,input()));verify(trips,never()).replaceStops(any(),any());}
    @Test void rejectsDatesOutsideTheTrip(){TripPlannerController controller=setup();when(ai.generate(anyString(),anyString())).thenReturn(proposal(placeId.toString(),"2027-11-01"));assertThrows(Exception.class,()->controller.draft(id,input()));}
    @Test void localDraftNeverCallsExternalAi(){TripPlannerController controller=setup();TripPlannerController.Input input=new TripPlannerController.Input();assertEquals(1,controller.draft(id,input).stops.size());verify(ai,never()).generate(anyString(),anyString());}
}
