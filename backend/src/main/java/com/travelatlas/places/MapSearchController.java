package com.travelatlas.places;

import com.fasterxml.jackson.databind.JsonNode;
import com.travelatlas.common.ExternalJsonClient;
import java.net.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/maps")
public class MapSearchController {
    private final ExternalJsonClient http;private final String endpoint,provider;
    public MapSearchController(ExternalJsonClient http,@Value("${travel.geocoder.url:}") String endpoint,@Value("${travel.geocoder.provider:photon}") String provider){this.http=http;this.endpoint=endpoint;this.provider=provider;}
    @GetMapping("/status") public Map<String,Object> status(){Map<String,Object> result=new LinkedHashMap<>();result.put("searchAvailable",!endpoint.trim().isEmpty());result.put("provider",provider);result.put("attribution","photon".equals(provider)?"Photon / OpenStreetMap contributors":"OpenStreetMap contributors");return result;}
    @GetMapping("/search") public List<Map<String,Object>> search(@RequestParam String query)throws Exception{
        if(endpoint.trim().isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"地点搜索已关闭，可继续使用地图选点");
        String term=query.trim();if(term.length()<2||term.length()>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请输入 2 至 180 个字符的地点名称");
        URI uri=ExternalJsonClient.endpoint(endpoint);if(uri.getQuery()!=null||!Arrays.asList("photon","nominatim").contains(provider))throw new ResponseStatusException(HttpStatus.CONFLICT,"地点搜索服务配置无效");
        boolean photon="photon".equals(provider);
        String parameters=photon?"?limit=5&q=":"?format=jsonv2&limit=5&accept-language=zh-CN&q=";
        JsonNode response=http.get(endpoint+parameters+URLEncoder.encode(term,"UTF-8"),"geocoder",900000,1100);
        JsonNode items=photon?response.path("features"):response;
        if(!items.isArray())throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"地点服务未返回候选列表");
        List<Map<String,Object>> result=new ArrayList<>();
        for(JsonNode item:items){if(result.size()>=5)break;JsonNode properties=photon?item.path("properties"):item;
            double latitude=photon?item.path("geometry").path("coordinates").path(1).asDouble(Double.NaN):item.path("lat").asDouble(Double.NaN);
            double longitude=photon?item.path("geometry").path("coordinates").path(0).asDouble(Double.NaN):item.path("lon").asDouble(Double.NaN);
            if(!Double.isFinite(latitude)||!Double.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)continue;
            Map<String,Object> row=new LinkedHashMap<>();row.put("name",properties.path("name").asText());row.put("city",properties.path("city").asText(properties.path("county").asText()));
            StringJoiner address=new StringJoiner(" · ");for(String field:Arrays.asList("country","state","city","street","housenumber")){String value=properties.path(field).asText();if(!value.isEmpty())address.add(value);}
            row.put("address",photon?address.toString():item.path("display_name").asText());row.put("latitude",latitude);row.put("longitude",longitude);result.add(row);
        }
        return result;
    }
}
