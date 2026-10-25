package com.travelatlas.trips;

import java.time.LocalDate;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class TripRequest {
    @NotBlank @Size(max = 180)
    private String name;
    @Size(max = 180)
    private String destination;
    @Size(max = 10000)
    private String notes;
    private LocalDate startsOn;
    private LocalDate endsOn;
    @javax.validation.constraints.Pattern(regexp="planning|upcoming|ongoing|completed|archived") private String status;
    private boolean shiftStops;
    public boolean isShiftStops(){return shiftStops;} public void setShiftStops(boolean value){shiftStops=value;}
    @javax.validation.Valid private TripPreferences preferences;
    public String getStatus(){return status;} public void setStatus(String value){status=value;}
    public TripPreferences getPreferences(){return preferences;} public void setPreferences(TripPreferences value){preferences=value;}

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDate getStartsOn() { return startsOn; }
    public void setStartsOn(LocalDate startsOn) { this.startsOn = startsOn; }
    public LocalDate getEndsOn() { return endsOn; }
    public void setEndsOn(LocalDate endsOn) { this.endsOn = endsOn; }
}
