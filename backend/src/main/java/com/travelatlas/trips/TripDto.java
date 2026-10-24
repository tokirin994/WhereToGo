package com.travelatlas.trips;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public class TripDto {
    private UUID id;
    private String name;
    private String destination;
    private LocalDate startsOn;
    private LocalDate endsOn;
    private String status;
    private String notes;
    private List<TripStopDto> stops;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public LocalDate getStartsOn() { return startsOn; }
    public void setStartsOn(LocalDate startsOn) { this.startsOn = startsOn; }
    public LocalDate getEndsOn() { return endsOn; }
    public void setEndsOn(LocalDate endsOn) { this.endsOn = endsOn; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public List<TripStopDto> getStops() { return stops; }
    public void setStops(List<TripStopDto> stops) { this.stops = stops; }
}
