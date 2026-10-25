package com.travelatlas.places;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PlaceMapper {
    int count(@Param("userId") UUID userId);
    List<PlaceDto> findAll(@Param("city") String city, @Param("category") String category, @Param("query") String query, @Param("userId") UUID userId);
    PlaceDto findById(@Param("id") UUID id, @Param("userId") UUID userId);
    List<PlaceDto> findInBounds(@Param("minLng") double minLng, @Param("minLat") double minLat,
                               @Param("maxLng") double maxLng, @Param("maxLat") double maxLat, @Param("userId") UUID userId);
    int insert(@Param("id") UUID id, @Param("request") PlaceRequest request, @Param("userId") UUID userId);
    int update(@Param("id") UUID id, @Param("request") PlaceRequest request, @Param("userId") UUID userId);
    int softDelete(@Param("id") UUID id, @Param("userId") UUID userId);
    void detachStops(@Param("id") UUID id, @Param("userId") UUID userId);
    void deleteTags(@Param("placeId") UUID placeId, @Param("userId") UUID userId);
    void insertTags(@Param("tags") List<String> tags, @Param("userId") UUID userId);
    void linkTags(@Param("placeId") UUID placeId, @Param("tags") List<String> tags, @Param("userId") UUID userId);
}
