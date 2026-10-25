package com.travelatlas.trips;

import java.time.LocalDate;
import java.util.UUID;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Positive;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.Size;

public class TripStopRequest {
    @javax.validation.constraints.DecimalMin("0") @javax.validation.constraints.DecimalMax("999999999") private java.math.BigDecimal estimatedCost=java.math.BigDecimal.ZERO;
    private boolean completed;
    public java.math.BigDecimal getEstimatedCost(){return estimatedCost;} public void setEstimatedCost(java.math.BigDecimal v){estimatedCost=v;}
    public boolean isCompleted(){return completed;} public void setCompleted(boolean v){completed=v;}
    private UUID id;
    private UUID placeId;
    @NotNull private LocalDate dayDate;
    @NotBlank @Size(max = 180) private String placeName;
    @Size(max = 80) private String category;
    @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$") private String startsAt;
    @Positive @Max(1440) private Integer durationMinutes;
    @Size(max = 500) private String note;
    @NotNull @Min(0) @Max(299) private Integer sortOrder;

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
