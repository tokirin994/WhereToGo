package com.travelatlas.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Bounded HTTPS transport; public DNS is verified and pinned for every connection. */
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
        org.apache.http.client.config.RequestConfig options=org.apache.http.client.config.RequestConfig.custom().setConnectTimeout(5000).setSocketTimeout(timeout).setConnectionRequestTimeout(5000).setRedirectsEnabled(false).build();
        try(org.apache.http.impl.client.CloseableHttpClient client=org.apache.http.impl.client.HttpClients.custom().setDnsResolver(ExternalJsonClient::publicAddresses).disableRedirectHandling().disableAutomaticRetries().setDefaultRequestConfig(options).build()){
            java.net.URI uri=endpoint(address);
            org.apache.http.client.methods.HttpRequestBase request;
            if(payload==null)request=new org.apache.http.client.methods.HttpGet(uri);
            else{org.apache.http.client.methods.HttpPost post=new org.apache.http.client.methods.HttpPost(uri);post.setEntity(new org.apache.http.entity.ByteArrayEntity(json.writeValueAsBytes(payload),org.apache.http.entity.ContentType.APPLICATION_JSON));request=post;}
            request.setHeader("User-Agent","WhereToGo/0.4 (+https://github.com/tokirin994/WhereToGo)");request.setHeader("Accept","application/json");
            for(Map.Entry<String,String> header:headers.entrySet())request.setHeader(header.getKey(),header.getValue());
            try(org.apache.http.client.methods.CloseableHttpResponse response=client.execute(request)){
                int status=response.getStatusLine().getStatusCode();if(status<200||status>=300||response.getEntity()==null)throw new IOException("provider_rejected");
                try(InputStream in=response.getEntity().getContent();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] buffer=new byte[8192];int count,total=0;while((count=in.read(buffer))!=-1){total+=count;if(total>maxBytes)throw new IOException("response_limit");out.write(buffer,0,count);}return json.readTree(out.toByteArray());
                }
            }
        }catch(ResponseStatusException error){throw error;}catch(Exception error){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"外部服务暂时不可用，请检查服务地址、Key 和模型；原有数据未修改");}
    }
    /** Resolve once inside the HTTP transport, and connect only to the verified public addresses. */
    public static InetAddress[] publicAddresses(String host)throws UnknownHostException{
        InetAddress[] addresses=InetAddress.getAllByName(host);
        for(InetAddress address:addresses)if(!publicAddress(address))throw new UnknownHostException("Private service destinations are forbidden");
        return addresses;
    }
    public static boolean publicAddress(InetAddress address){
        if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())return false;
        byte[] b=address.getAddress();int first=b[0]&255,second=b[1]&255;
        if(b.length==16)return (first&0xfe)!=0xfc&&first!=0xff;
        return first!=0&&first<224&&!(first==100&&second>=64&&second<=127)&&!(first==192&&second==0)&&!(first==198&&(second==18||second==19));
    }
    private static class Cached{final JsonNode value;final long expires;Cached(JsonNode value,long expires){this.value=value;this.expires=expires;}}
}
