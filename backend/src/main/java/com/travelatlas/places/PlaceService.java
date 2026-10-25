package com.travelatlas.places;

import java.util.List;
import java.util.UUID;
import com.travelatlas.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlaceService {
    private final PlaceMapper mapper;
    private final CurrentUser currentUser;

    public PlaceService(PlaceMapper mapper, CurrentUser currentUser) { this.mapper = mapper; this.currentUser = currentUser; }

    public List<PlaceDto> findAll(String city, String category, String query) {
        if(city!=null&&city.length()>120||category!=null&&category.length()>40||query!=null&&query.length()>200)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"搜索条件过长");
        return mapper.findAll(blankToNull(city), blankToNull(category), blankToNull(query), currentUser.id());
    }
    public PlaceDto find(UUID id) {
        PlaceDto place = mapper.findById(id, currentUser.id());
        if (place == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
        return place;
    }
    public List<PlaceDto> findInBounds(double minLng, double minLat, double maxLng, double maxLat) {
        if (!Double.isFinite(minLng)||!Double.isFinite(maxLng)||!Double.isFinite(minLat)||!Double.isFinite(maxLat)||minLng < -180||maxLng > 180||minLat < -90||maxLat > 90||minLng > maxLng || minLat > maxLat) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "地图范围无效");
        return mapper.findInBounds(minLng, minLat, maxLng, maxLat, currentUser.id());
    }
    @Transactional
    public PlaceDto create(PlaceRequest request) {
        if(mapper.count(currentUser.id())>=500)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"当前版本每个账号最多保存 500 个地点");
        UUID id = UUID.randomUUID();
        mapper.insert(id, request, currentUser.id());
        replaceTags(id, request.getTags());
        return find(id);
    }
    @Transactional public List<PlaceDto> createBatch(List<PlaceRequest> requests){List<PlaceDto> result=new java.util.ArrayList<>();for(PlaceRequest request:requests)result.add(create(request));return result;}
    @Transactional
    public PlaceDto update(UUID id, PlaceRequest request) {
        if (mapper.update(id, request, currentUser.id()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
        replaceTags(id, request.getTags());
        return find(id);
    }
    @Transactional
    public void delete(UUID id) {
        mapper.detachStops(id,currentUser.id());
        if (mapper.softDelete(id, currentUser.id()) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
    }
    private void replaceTags(UUID id, List<String> tags) {
        mapper.deleteTags(id, currentUser.id());
        if (tags != null && !tags.isEmpty()) {
            List<String> normalized = tags.stream().map(String::trim).filter(s -> !s.isEmpty()).distinct().collect(java.util.stream.Collectors.toList());
            if (!normalized.isEmpty()) {
                mapper.insertTags(normalized, currentUser.id());
                mapper.linkTags(id, normalized, currentUser.id());
            }
        }
    }
    private String blankToNull(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
}
