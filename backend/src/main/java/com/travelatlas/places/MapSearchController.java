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
    @org.springframework.beans.factory.annotation.Autowired(required=false) private com.travelatlas.account.ProviderVault vault;
    private final ExternalJsonClient http;private final String endpoint,provider;
    public MapSearchController(ExternalJsonClient http,@Value("${travel.geocoder.url:}") String endpoint,@Value("${travel.geocoder.provider:photon}") String provider){this.http=http;this.endpoint=endpoint;this.provider=provider;}
    @GetMapping("/status") public Map<String,Object> status(){boolean amap=vault!=null&&vault.current("amap")!=null;Map<String,Object> result=new LinkedHashMap<>();result.put("searchAvailable",amap||!endpoint.trim().isEmpty());result.put("provider",amap?"amap":provider);result.put("attribution",amap?"高德地图（已转换为 WGS84）":"photon".equals(provider)?"Photon / OpenStreetMap contributors":"OpenStreetMap contributors");return result;}
    @GetMapping("/search") public List<Map<String,Object>> search(@RequestParam String query)throws Exception{
        String term=query.trim();if(term.length()<2||term.length()>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请输入 2 至 180 个字符的地点名称");
        JsonNode amap=vault==null?null:vault.current("amap");if(amap!=null)return searchAmap(term,amap.path("apiKey").asText());
        if(endpoint.trim().isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"地点搜索已关闭，可继续使用地图选点");
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
    private List<Map<String,Object>> searchAmap(String term,String key)throws Exception{
        JsonNode response=http.get("https://restapi.amap.com/v3/place/text?offset=5&page=1&extensions=base&keywords="+URLEncoder.encode(term,"UTF-8")+"&key="+URLEncoder.encode(key,"UTF-8"),"amap",600000,300);
        if(!"1".equals(response.path("status").asText()))throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"高德地点搜索失败，请检查个人 Key、服务类型和配额");
        List<Map<String,Object>> result=new ArrayList<>();
        for(JsonNode poi:response.path("pois")){
            if(result.size()>=5)break;String[] location=poi.path("location").asText().split(",");if(location.length!=2)continue;
            try{double[] point=gcjToWgs(Double.parseDouble(location[0]),Double.parseDouble(location[1]));Map<String,Object> row=new LinkedHashMap<>();row.put("name",poi.path("name").asText());row.put("city",poi.path("cityname").asText());row.put("address",poi.path("pname").asText()+poi.path("cityname").asText()+poi.path("adname").asText()+poi.path("address").asText());row.put("longitude",point[0]);row.put("latitude",point[1]);result.add(row);}catch(NumberFormatException ignored){}
        }return result;
    }
    /** GCJ-02 is not WGS84. Iteratively invert the standard China offset. */
    public static double[] gcjToWgs(double lon,double lat){
        if(!Double.isFinite(lon)||!Double.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)throw new NumberFormatException();
        if(lon<72.004||lon>137.8347||lat<0.8293||lat>55.8271)return new double[]{lon,lat};
        double x=lon,y=lat;for(int i=0;i<5;i++){double a=x-105,b=y-35;double dLat=-100+2*a+3*b+.2*b*b+.1*a*b+.2*Math.sqrt(Math.abs(a));double dLon=300+a+2*b+.1*a*a+.1*a*b+.1*Math.sqrt(Math.abs(a));double wave=(20*Math.sin(6*a*Math.PI)+20*Math.sin(2*a*Math.PI))*2/3;dLat+=wave+(20*Math.sin(b*Math.PI)+40*Math.sin(b/3*Math.PI))*2/3+(160*Math.sin(b/12*Math.PI)+320*Math.sin(b*Math.PI/30))*2/3;dLon+=wave+(20*Math.sin(a*Math.PI)+40*Math.sin(a/3*Math.PI))*2/3+(150*Math.sin(a/12*Math.PI)+300*Math.sin(a/30*Math.PI))*2/3;double rad=y*Math.PI/180,magic=1-.00669342162296594323*Math.sin(rad)*Math.sin(rad),sqrt=Math.sqrt(magic);dLat=dLat*180/((6378245*(1-.00669342162296594323))/(magic*sqrt)*Math.PI);dLon=dLon*180/(6378245/sqrt*Math.cos(rad)*Math.PI);x-=x+dLon-lon;y-=y+dLat-lat;}return new double[]{x,y};
    }
}
