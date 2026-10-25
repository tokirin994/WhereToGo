package com.travelatlas.trips;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TripMapper {
    List<TripDto> findAll(@Param("userId") UUID userId);
    TripDto findById(@Param("id") UUID id, @Param("userId") UUID userId);
    int insert(@Param("id") UUID id, @Param("request") TripRequest request, @Param("userId") UUID userId);
    int update(@Param("id") UUID id, @Param("request") TripRequest request, @Param("userId") UUID userId);
    int countStopsOutsideRange(@Param("id") UUID id, @Param("request") TripRequest request, @Param("userId") UUID userId);
    void shiftStops(@Param("id") UUID id, @Param("days") int days, @Param("userId") UUID userId);
    int softDelete(@Param("id") UUID id, @Param("userId") UUID userId);
    void deleteStops(@Param("tripId") UUID tripId, @Param("userId") UUID userId);
    void insertStops(@Param("tripId") UUID tripId, @Param("stops") List<TripStopRequest> stops, @Param("userId") UUID userId);
}
