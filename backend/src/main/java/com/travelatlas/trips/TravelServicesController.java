package com.travelatlas.trips;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.travelatlas.common.ExternalJsonClient;
import com.travelatlas.places.*;
import java.net.URLEncoder;
import java.time.LocalDate;
import java.util.*;
import javax.validation.Valid;
import javax.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/travel-services")
public class TravelServicesController {
    private final ExternalJsonClient http;private final ObjectMapper json;private final TripService trips;private final PlaceService places;
    private final String weather,destinations,drive,walk;
    public TravelServicesController(ExternalJsonClient http,ObjectMapper json,TripService trips,PlaceService places,
        @Value("${travel.weather.url:}") String weather,@Value("${travel.destination-search-url:}") String destinations,
        @Value("${travel.routing.driving-url:}") String drive,@Value("${travel.routing.walking-url:}") String walk){this.http=http;this.json=json;this.trips=trips;this.places=places;this.weather=weather;this.destinations=destinations;this.drive=drive;this.walk=walk;}
    @GetMapping("/destinations") public JsonNode destinations(@RequestParam String query)throws Exception{
        String term=query.trim();if(term.length()<2||term.length()>120)throw bad("请输入 2–120 字的城市名称");
        require(destinations);JsonNode result=http.get(destinations+"?count=8&language=zh&name="+URLEncoder.encode(term,"UTF-8"),"destinations",3600000,1100).path("results");return result.isArray()?result:json.createArrayNode();
    }
    @GetMapping("/weather") public ObjectNode weather(@RequestParam double latitude,@RequestParam double longitude){
        require(weather);if(!Double.isFinite(latitude)||!Double.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw bad("天气坐标无效");
        String address=weather+"?latitude="+latitude+"&longitude="+longitude+"&timezone=auto&forecast_days=16&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
        JsonNode response=http.get(address,"weather",900000,1100);if(!response.path("daily").path("time").isArray())throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"天气数据格式无效");
        ObjectNode result=json.createObjectNode();result.set("daily",response.path("daily"));result.set("current",response.path("current"));result.put("timezone",response.path("timezone").asText());result.put("source","Open-Meteo");result.put("fetchedAt",java.time.Instant.now().toString());return result;
    }
    @PostMapping("/trips/{id}/route") public ObjectNode route(@PathVariable UUID id,@Valid @RequestBody RouteInput input){
        TripDto trip=trips.find(id);List<TripStopDto> stops=new ArrayList<>();for(TripStopDto stop:trip.getStops())if(stop.getDayDate().equals(input.date))stops.add(stop);
        stops.sort(Comparator.comparing(TripStopDto::getSortOrder));if(stops.size()<2||stops.size()>25)throw bad("道路路线需要当天 2–25 项安排，所有安排都需关联已定位地点");
        Map<UUID,PlaceDto> library=new HashMap<>();for(PlaceDto place:places.findAll(null,null,null))library.put(place.getId(),place);
        StringJoiner coordinates=new StringJoiner(";");for(TripStopDto stop:stops){PlaceDto p=library.get(stop.getPlaceId());if(p==null||p.getLongitude()==null||p.getLatitude()==null)throw bad("请先为当天每项安排关联已定位的收藏地点；不会跳过未知位置计算路线");coordinates.add(p.getLongitude()+","+p.getLatitude());}
        String base="walk".equals(input.mode)?walk:drive;require(base);
        JsonNode response=http.get(base.replaceAll("/+$","")+"/"+coordinates+"?overview=simplified&geometries=geojson&steps=false","routing",3600000,1100);
        JsonNode route=response.path("routes").path(0);if(!"Ok".equals(response.path("code").asText())||!route.path("geometry").path("coordinates").isArray())throw new ResponseStatusException(HttpStatus.CONFLICT,"未找到可用道路路线，可打开外部导航继续查询");
        JsonNode geometry=route.path("geometry").path("coordinates");
        if(geometry.size()<2||geometry.size()>50000||!validMeasure(route.path("distance"))||!validMeasure(route.path("duration"))||!route.path("legs").isArray()||route.path("legs").size()!=stops.size()-1)throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"道路服务返回格式无效");
        for(JsonNode point:geometry)if(!point.isArray()||point.size()<2||!point.path(0).isNumber()||!point.path(1).isNumber()||!Double.isFinite(point.path(0).asDouble())||!Double.isFinite(point.path(1).asDouble())||Math.abs(point.path(0).asDouble())>180||Math.abs(point.path(1).asDouble())>90)throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"道路服务返回坐标无效");
        for(JsonNode leg:route.path("legs"))if(!validMeasure(leg.path("distance"))||!validMeasure(leg.path("duration")))throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"道路服务返回分段数据无效");
        ObjectNode result=json.createObjectNode();result.set("geometry",route.path("geometry"));result.set("legs",route.path("legs"));result.put("distance",route.path("distance").asDouble());result.put("duration",route.path("duration").asDouble());result.put("mode",input.mode);result.put("source","OSRM / FOSSGIS / OpenStreetMap contributors");result.put("trafficAware",false);return result;
    }
    private void require(String endpoint){if(endpoint.trim().isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"该外部服务已由部署者关闭");if(ExternalJsonClient.endpoint(endpoint).getQuery()!=null)throw bad("外部服务端点不能包含查询参数");}
    private boolean validMeasure(JsonNode value){return value.isNumber()&&Double.isFinite(value.asDouble())&&value.asDouble()>=0;}
    private ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    public static class RouteInput{@NotNull public LocalDate date;@NotNull @Pattern(regexp="walk|drive") public String mode="drive";}
}
