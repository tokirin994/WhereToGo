package com.travelatlas.trips;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import javax.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/trips")
public class TripController {
    private final TripService service;
    public TripController(TripService service) { this.service = service; }

    @GetMapping public List<TripDto> list() { return service.findAll(); }
    @GetMapping("/{id}") public TripDto get(@PathVariable UUID id) { return service.find(id); }
    @PostMapping
    public ResponseEntity<TripDto> create(@Valid @RequestBody TripRequest request) {
        TripDto trip = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/trips/" + trip.getId())).body(trip);
    }
    @PutMapping("/{id}") public TripDto update(@PathVariable UUID id, @Valid @RequestBody TripRequest request) { return service.update(id, request); }
    @PutMapping("/{id}/stops") public TripDto replaceStops(@PathVariable UUID id, @Valid @RequestBody List<@Valid TripStopRequest> stops) { return service.replaceStops(id, stops); }
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable UUID id) { service.delete(id); return ResponseEntity.noContent().build(); }
}
