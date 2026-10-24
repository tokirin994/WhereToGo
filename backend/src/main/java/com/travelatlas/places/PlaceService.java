package com.travelatlas.places;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlaceService {
    private final PlaceMapper mapper;

    public PlaceService(PlaceMapper mapper) { this.mapper = mapper; }

    public List<PlaceDto> findAll(String city, String category, String query) {
        return mapper.findAll(blankToNull(city), blankToNull(category), blankToNull(query));
    }
    public PlaceDto find(UUID id) {
        PlaceDto place = mapper.findById(id);
        if (place == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
        return place;
    }
    public List<PlaceDto> findInBounds(double minLng, double minLat, double maxLng, double maxLat) {
        if (minLng > maxLng || minLat > maxLat) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "地图范围无效");
        return mapper.findInBounds(minLng, minLat, maxLng, maxLat);
    }
    @Transactional
    public PlaceDto create(PlaceRequest request) {
        UUID id = UUID.randomUUID();
        mapper.insert(id, request);
        replaceTags(id, request.getTags());
        return find(id);
    }
    @Transactional
    public PlaceDto update(UUID id, PlaceRequest request) {
        if (mapper.update(id, request) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
        replaceTags(id, request.getTags());
        return find(id);
    }
    public void delete(UUID id) {
        if (mapper.softDelete(id) == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "地点不存在");
    }
    private void replaceTags(UUID id, List<String> tags) {
        mapper.deleteTags(id);
        if (tags != null && !tags.isEmpty()) {
            List<String> normalized = tags.stream().map(String::trim).filter(s -> !s.isEmpty()).distinct().collect(java.util.stream.Collectors.toList());
            if (!normalized.isEmpty()) {
                mapper.insertTags(normalized);
                mapper.linkTags(id, normalized);
            }
        }
    }
    private String blankToNull(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
}
