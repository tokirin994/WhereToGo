package com.travelatlas.trips;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TripMapper {
    List<TripDto> findAll();
    TripDto findById(@Param("id") UUID id);
    int insert(@Param("id") UUID id, @Param("request") TripRequest request);
    int update(@Param("id") UUID id, @Param("request") TripRequest request);
    int countStopsOutsideRange(@Param("id") UUID id, @Param("request") TripRequest request);
    int softDelete(@Param("id") UUID id);
    void deleteStops(@Param("tripId") UUID tripId);
    void insertStops(@Param("tripId") UUID tripId, @Param("stops") List<TripStopRequest> stops);
}
