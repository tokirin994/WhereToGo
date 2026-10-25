package com.travelatlas.places;

import javax.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@org.springframework.validation.annotation.Validated
@RequestMapping("/api/v1/places")
public class PlaceController {
    private final PlaceService service;
    public PlaceController(PlaceService service) { this.service = service; }

    @GetMapping
    public List<PlaceDto> list(@RequestParam(required = false) String city,
                               @RequestParam(required = false) String category,
                               @RequestParam(required = false, name = "q") String query) {
        return service.findAll(city, category, query);
    }
    @GetMapping("/map")
    public List<PlaceDto> map(@RequestParam double minLng, @RequestParam double minLat,
                              @RequestParam double maxLng, @RequestParam double maxLat) {
        return service.findInBounds(minLng, minLat, maxLng, maxLat);
    }
    @GetMapping("/{id}")
    public PlaceDto get(@PathVariable UUID id) { return service.find(id); }
    @PostMapping
    public ResponseEntity<PlaceDto> create(@Valid @RequestBody PlaceRequest request) {
        PlaceDto place = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/places/" + place.getId())).body(place);
    }
    @PatchMapping("/{id}")
    public PlaceDto update(@PathVariable UUID id, @Valid @RequestBody PlaceRequest request) { return service.update(id, request); }
    @PostMapping("/batch") public List<PlaceDto> batch(@Valid @RequestBody @javax.validation.constraints.NotNull @javax.validation.constraints.Size(min=1,max=100) List<@javax.validation.constraints.NotNull @Valid PlaceRequest> requests){return service.createBatch(requests);}
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) { service.delete(id); return ResponseEntity.noContent().build(); }
}
