package com.travelatlas.trips;

import java.time.LocalDate;
import java.util.UUID;

public class TripStopDto {
    private UUID id;
    private UUID placeId;
    private LocalDate dayDate;
    private String placeName;
    private String category;
    private String startsAt;
    private Integer durationMinutes;
    private String note;
    private Integer sortOrder;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getPlaceId() { return placeId; }
    public void setPlaceId(UUID placeId) { this.placeId = placeId; }
    public LocalDate getDayDate() { return dayDate; }
    public void setDayDate(LocalDate dayDate) { this.dayDate = dayDate; }
    public String getPlaceName() { return placeName; }
    public void setPlaceName(String placeName) { this.placeName = placeName; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStartsAt() { return startsAt; }
    public void setStartsAt(String startsAt) { this.startsAt = startsAt; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
