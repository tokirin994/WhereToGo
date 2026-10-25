package com.travelatlas.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Fixed operator-selected providers only. No user-supplied remote URL is fetched. */
@Component
public class ExternalJsonClient {
    private final ObjectMapper json;
    private final Map<String,Cached> cache=new LinkedHashMap<>();
    private final Map<String,Long> lastCall=new HashMap<>();
    public ExternalJsonClient(ObjectMapper json){this.json=json;}
    public static URI endpoint(String value){
        try{URI uri=URI.create(value);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getFragment()!=null)throw new IllegalArgumentException();return uri;}
        catch(Exception error){throw new ResponseStatusException(HttpStatus.CONFLICT,"外部服务地址配置无效，需要 HTTPS 地址");}
    }
    public JsonNode get(String address,String service,long ttl,long interval){
        endpoint(address);long now=System.currentTimeMillis();
        synchronized(this){
            cache.entrySet().removeIf(entry->entry.getValue().expires<now);
            Cached found=cache.get(address);if(found!=null)return found.value.deepCopy();
            if(now-lastCall.getOrDefault(service,0L)<interval)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"外部查询较频繁，请稍等片刻重试");
            lastCall.put(service,now);
        }
        JsonNode body=send(address,null,Collections.emptyMap(),15000,1048576);
        synchronized(this){if(cache.size()>=500)cache.remove(cache.keySet().iterator().next());cache.put(address,new Cached(body,now+ttl));}
        return body.deepCopy();
    }
    public JsonNode send(String address,JsonNode payload,Map<String,String> headers,int timeout,int maxBytes){
        HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)endpoint(address).toURL().openConnection();
            connection.setConnectTimeout(5000);connection.setReadTimeout(timeout);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent","WhereToGo/0.3 (+https://github.com/tokirin994/WhereToGo)");
            connection.setRequestProperty("Accept","application/json");
            for(Map.Entry<String,String> header:headers.entrySet())connection.setRequestProperty(header.getKey(),header.getValue());
            if(payload!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write(json.writeValueAsBytes(payload));}}
            int status=connection.getResponseCode();
            if(status<200||status>=300)throw new IOException("provider_http_"+status);
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count,total=0;while((count=in.read(buffer))!=-1){total+=count;if(total>maxBytes)throw new IOException("response_limit");out.write(buffer,0,count);}return json.readTree(out.toByteArray());
            }
        }catch(ResponseStatusException error){throw error;}catch(Exception error){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"外部服务暂时不可用，请稍后重试；原有数据未修改");}
        finally{if(connection!=null)connection.disconnect();}
    }
    private static class Cached{final JsonNode value;final long expires;Cached(JsonNode value,long expires){this.value=value;this.expires=expires;}}
}
