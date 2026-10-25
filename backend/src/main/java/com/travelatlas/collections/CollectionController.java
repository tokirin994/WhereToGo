package com.travelatlas.collections;

import com.travelatlas.security.CurrentUser;
import java.util.*;
import javax.validation.Valid;
import javax.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/collections")
public class CollectionController {
    private final JdbcTemplate jdbc;private final CurrentUser currentUser;
    public CollectionController(JdbcTemplate jdbc,CurrentUser currentUser){this.jdbc=jdbc;this.currentUser=currentUser;}
    @GetMapping public List<Map<String,Object>> list(){
        UUID owner=currentUser.id();
        List<Map<String,Object>> rows=jdbc.query("SELECT id,name,description,color FROM travel_collections WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",(rs,index)->{
            Map<String,Object> row=new LinkedHashMap<>();row.put("id",rs.getObject("id"));row.put("name",rs.getString("name"));row.put("description",rs.getString("description"));row.put("color",rs.getString("color"));return row;
        },owner);
        for(Map<String,Object> row:rows)row.put("placeIds",jdbc.queryForList("SELECT cp.place_id FROM travel_collection_places cp JOIN places p ON p.id=cp.place_id WHERE cp.collection_id=? AND p.user_id=? AND p.deleted_at IS NULL",UUID.class,row.get("id"),owner));
        return rows;
    }
    private void require(UUID id){if(jdbc.queryForObject("SELECT count(*) FROM travel_collections WHERE id=? AND user_id=? AND deleted_at IS NULL",Integer.class,id,currentUser.id())==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"合集不存在");}
    private void replaceMembers(UUID id,List<UUID> members){
        List<UUID> ids=new ArrayList<>(new LinkedHashSet<>(members));
        if(!ids.isEmpty()){
            Map<String,Object> params=new HashMap<>();params.put("ids",ids);params.put("owner",currentUser.id());
            Integer count=new NamedParameterJdbcTemplate(jdbc).queryForObject("SELECT count(*) FROM places WHERE user_id=:owner AND deleted_at IS NULL AND id IN (:ids)",params,Integer.class);
            if(count==null||count!=ids.size())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"合集只能包含当前账号已经保存的地点");
        }
        jdbc.update("DELETE FROM travel_collection_places WHERE collection_id=?",id);
        List<Object[]> values=new ArrayList<>();for(UUID place:ids)values.add(new Object[]{id,place});
        if(!values.isEmpty())jdbc.batchUpdate("INSERT INTO travel_collection_places(collection_id,place_id) VALUES (?,?)",values);
    }
    @PostMapping @Transactional public Map<String,Object> create(@Valid @RequestBody Input input){
        if(jdbc.queryForObject("SELECT count(*) FROM travel_collections WHERE user_id=? AND deleted_at IS NULL",Integer.class,currentUser.id())>=500)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"最多创建 500 个合集");
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO travel_collections(id,user_id,name,description,color) VALUES (?,?,?,?,?)",id,currentUser.id(),input.name.trim(),input.description,input.color);
        replaceMembers(id,input.placeIds);return result(id,input);
    }
    @PutMapping("/{id}") @Transactional public Map<String,Object> update(@PathVariable UUID id,@Valid @RequestBody Input input){
        require(id);jdbc.update("UPDATE travel_collections SET name=?,description=?,color=?,updated_at=now() WHERE id=? AND user_id=?",input.name.trim(),input.description,input.color,id,currentUser.id());
        replaceMembers(id,input.placeIds);return result(id,input);
    }
    @DeleteMapping("/{id}") @Transactional public void delete(@PathVariable UUID id){require(id);jdbc.update("UPDATE travel_collections SET deleted_at=now() WHERE id=? AND user_id=?",id,currentUser.id());}
    private Map<String,Object> result(UUID id,Input input){Map<String,Object> row=new LinkedHashMap<>();row.put("id",id);row.put("name",input.name.trim());row.put("description",input.description);row.put("color",input.color);row.put("placeIds",new ArrayList<>(new LinkedHashSet<>(input.placeIds)));return row;}
    public static class Input{
        @NotBlank @Size(max=100) public String name;
        @NotNull @Size(max=500) public String description="";
        @NotNull @Pattern(regexp="#[0-9a-fA-F]{6}") public String color="#4d7c76";
        @NotNull @Size(max=500) public List<@NotNull UUID> placeIds=new ArrayList<>();
    }
}
