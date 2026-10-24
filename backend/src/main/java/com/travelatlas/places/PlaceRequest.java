package com.travelatlas.places;

import javax.validation.constraints.AssertTrue;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;
import java.util.List;

public class PlaceRequest {
    @NotBlank @Size(max = 180) private String name;
    @NotBlank @Size(max = 120) private String city;
    @Size(max = 300) private String address;
    @NotBlank @Pattern(regexp = "景点|美食|咖啡|住宿") private String category;
    @Size(max = 20) private List<@NotBlank @Size(max = 40) String> tags;
    private Double longitude;
    private Double latitude;
    @Pattern(regexp = "WGS84") private String coordinateSystem;

    public PlaceRequest() { }

    @AssertTrue(message = "经度和纬度必须同时提供，且范围有效")
    public boolean isCoordinatePairValid() {
        if (longitude == null && latitude == null) return coordinateSystem == null || coordinateSystem.equals("WGS84");
        return longitude != null && latitude != null
            && "WGS84".equals(coordinateSystem)
            && longitude >= -180 && longitude <= 180
            && latitude >= -90 && latitude <= 90;
    }

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
}
