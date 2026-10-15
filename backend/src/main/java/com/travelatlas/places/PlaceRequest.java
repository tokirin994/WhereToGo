package com.travelatlas.places;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record PlaceRequest(
        @NotBlank @Size(max = 180) String name,
        @NotBlank @Size(max = 120) String city,
        @Size(max = 300) String address,
        @NotBlank @Pattern(regexp = "景点|美食|咖啡|住宿") String category,
        @Size(max = 20) List<@NotBlank @Size(max = 40) String> tags,
        Double longitude,
        Double latitude,
        @Pattern(regexp = "WGS84") String coordinateSystem) {
    @AssertTrue(message = "经度和纬度必须同时提供，且范围有效")
    public boolean isCoordinatePairValid() {
        if (longitude == null && latitude == null) return coordinateSystem == null || coordinateSystem.equals("WGS84");
        return longitude != null && latitude != null
                && "WGS84".equals(coordinateSystem)
                && longitude >= -180 && longitude <= 180
                && latitude >= -90 && latitude <= 90;
    }
}
