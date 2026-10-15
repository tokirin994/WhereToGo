package com.travelatlas.places;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PlaceMapper {
    List<PlaceDto> findAll(@Param("city") String city, @Param("category") String category, @Param("query") String query);
    PlaceDto findById(@Param("id") UUID id);
    List<PlaceDto> findInBounds(@Param("minLng") double minLng, @Param("minLat") double minLat,
                               @Param("maxLng") double maxLng, @Param("maxLat") double maxLat);
    int insert(@Param("id") UUID id, @Param("request") PlaceRequest request);
    int update(@Param("id") UUID id, @Param("request") PlaceRequest request);
    int softDelete(@Param("id") UUID id);
    void deleteTags(@Param("placeId") UUID placeId);
    void insertTags(@Param("tags") List<String> tags);
    void linkTags(@Param("placeId") UUID placeId, @Param("tags") List<String> tags);
}
