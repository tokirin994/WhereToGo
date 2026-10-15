package com.travelatlas.places;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class PlaceDto {
    private UUID id;
    private String name;
    private String city;
    private String address;
    private String category;
    private List<String> tags;
    private Double longitude;
    private Double latitude;
    private String coordinateSystem;
    private String coordinateStatus;
    private String coordinateSource;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public String getCoordinateSystem() { return coordinateSystem; }
    public void setCoordinateSystem(String coordinateSystem) { this.coordinateSystem = coordinateSystem; }
    public String getCoordinateStatus() { return coordinateStatus; }
    public void setCoordinateStatus(String coordinateStatus) { this.coordinateStatus = coordinateStatus; }
    public String getCoordinateSource() { return coordinateSource; }
    public void setCoordinateSource(String coordinateSource) { this.coordinateSource = coordinateSource; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
