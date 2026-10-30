package com.travelatlas.library;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.travelatlas.places.*;
import com.travelatlas.security.CurrentUser;
import com.travelatlas.trips.*;
import java.time.LocalDate;
import java.util.*;
import javax.validation.Valid;
import javax.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/library")
public class RouteController {
    private final JdbcTemplate jdbc;private final CurrentUser user;private final ObjectMapper json;private final PlaceService places;private final TripService trips;
    public RouteController(JdbcTemplate jdbc,CurrentUser user,ObjectMapper json,PlaceService places,TripService trips){this.jdbc=jdbc;this.user=user;this.json=json;this.places=places;this.trips=trips;}
    @GetMapping("/routes") public List<JsonNode> list(){return jdbc.query("SELECT id,payload,updated_at FROM travel_routes WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",(rs,i)->{try{ObjectNode node=(ObjectNode)json.readTree(rs.getString("payload"));node.put("id",rs.getString("id"));node.put("updatedAt",rs.getString("updated_at"));return node;}catch(Exception e){throw new IllegalStateException("Invalid stored route",e);}},user.id());}
    @PostMapping("/routes") @Transactional public JsonNode create(@Valid @RequestBody RouteInput input){
        // Lock the owner's row so concurrent imports cannot bypass the collection limit.
        UUID owner=user.id();jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",UUID.class,owner);
        if(jdbc.queryForObject("SELECT count(*) FROM travel_routes WHERE user_id=? AND deleted_at IS NULL",Integer.class,owner)>=500)throw bad("每个账号最多保存 500 条路线");
        UUID id=UUID.randomUUID();ObjectNode node=json.valueToTree(input);node.remove("sourceValid");
        jdbc.update("INSERT INTO travel_routes(id,user_id,payload) VALUES (?,?,?::jsonb)",id,owner,node.toString());node.put("id",id.toString());return node;
    }
    @PutMapping("/routes/{id}") @Transactional public JsonNode update(@PathVariable UUID id,@Valid @RequestBody RouteInput input){
        ObjectNode node=json.valueToTree(input);node.remove("sourceValid");
        if(jdbc.update("UPDATE travel_routes SET payload=?::jsonb,updated_at=now() WHERE id=? AND user_id=? AND deleted_at IS NULL",node.toString(),id,user.id())==0)throw missing();node.put("id",id.toString());return node;
    }
    @DeleteMapping("/routes/{id}") @Transactional public void delete(@PathVariable UUID id){if(jdbc.update("UPDATE travel_routes SET deleted_at=now() WHERE id=? AND user_id=? AND deleted_at IS NULL",id,user.id())==0)throw missing();}
    @PostMapping("/routes/{id}/apply") @Transactional public TripDto apply(@PathVariable UUID id,@Valid @RequestBody ApplyInput input){
        UUID owner=user.id();
        List<String> rows=jdbc.queryForList("SELECT payload::text FROM travel_routes WHERE id=? AND user_id=? AND deleted_at IS NULL",String.class,id,owner);if(rows.isEmpty())throw missing();
        RouteInput route;try{route=json.readValue(rows.get(0),RouteInput.class);}catch(Exception e){throw new IllegalStateException("Invalid stored route",e);}
        if(jdbc.queryForList("SELECT id FROM trips WHERE id=? AND user_id=? AND deleted_at IS NULL FOR UPDATE",UUID.class,input.tripId,owner).isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"旅行不存在");
        TripDto trip=trips.find(input.tripId);if(trip.getStartsOn()==null||trip.getEndsOn()==null||input.date.isBefore(trip.getStartsOn())||input.date.isAfter(trip.getEndsOn()))throw bad("请选择旅行日期范围内的一天");
        Integer count=jdbc.queryForObject("SELECT count(*) FROM trip_stops WHERE trip_id=?",Integer.class,input.tripId);
        Integer maximum=jdbc.queryForObject("SELECT COALESCE(max(sort_order),-1) FROM trip_stops WHERE trip_id=?",Integer.class,input.tripId);
        if(count+route.waypoints.size()>300||maximum+route.waypoints.size()>299)throw bad("追加后超过单趟旅行 300 项安排限制");
        String[] clock=input.startsAt.split(":");int start=Integer.parseInt(clock[0])*60+Integer.parseInt(clock[1]);
        if(start+route.waypoints.size()*input.minutesPerStop>1440)throw bad("追加的安排超过当天午夜，请缩短每站停留时间或拆分路线");
        int index=0;for(RouteInput.Waypoint point:route.waypoints){
            int minute=start+index*input.minutesPerStop;String time=String.format("%02d:%02d",minute/60,minute%60);
            List<UUID> matching=jdbc.queryForList("SELECT id FROM places WHERE user_id=? AND deleted_at IS NULL AND name=? AND city=? LIMIT 2",UUID.class,owner,point.name,route.city);
            String note="路线收藏："+route.name+"\n"+point.note+(route.sourceUrl.isEmpty()?"":"\n"+route.sourceUrl);note=note.substring(0,Math.min(500,note.length()));
            jdbc.update("INSERT INTO trip_stops(id,trip_id,place_id,day_date,place_name,category,starts_at,duration_minutes,note,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),input.tripId,matching.size()==1?matching.get(0):null,input.date,point.name,"活动",time,input.minutesPerStop,note,maximum+1+index);index++;
        }
        jdbc.update("UPDATE trips SET updated_at=now() WHERE id=? AND user_id=?",input.tripId,owner);return trips.find(input.tripId);
    }
    /** A single transaction: a failed route must not leave half of an import saved. */
    @PostMapping("/imports") @Transactional public Map<String,Object> save(@Valid @RequestBody ImportInput input){
        if(input.places.isEmpty()&&input.routes.isEmpty())throw bad("请选择需要保存的地点或路线");
        UUID owner=user.id();jdbc.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE",UUID.class,owner);
        List<PlaceDto> savedPlaces=places.createBatch(input.places);List<JsonNode> savedRoutes=new ArrayList<>();
        for(RouteInput route:input.routes)savedRoutes.add(create(route));
        Map<String,Object> result=new LinkedHashMap<>();result.put("places",savedPlaces);result.put("routes",savedRoutes);return result;
    }
    public static class ImportInput {
        @NotNull @Size(max=80) public List<@NotNull @Valid PlaceRequest> places=new ArrayList<>();
        @NotNull @Size(max=20) public List<@NotNull @Valid RouteInput> routes=new ArrayList<>();
    }
    public static class ApplyInput {
        @NotNull public UUID tripId;
        @NotNull public LocalDate date;
        @NotNull @Pattern(regexp="([01][0-9]|2[0-3]):[0-5][0-9]") public String startsAt;
        @NotNull @Min(1) @Max(480) public Integer minutesPerStop;
    }
    private ResponseStatusException missing(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"路线不存在或已删除");}
    private ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
