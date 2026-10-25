package com.smartledger.security;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.servlet.FilterChain;
import javax.servlet.ReadListener;
import javax.servlet.ServletException;
import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

public final class ApiRequestFilter extends OncePerRequestFilter {
    private final ApiPolicy policy;
    private final java.util.Map<String,long[]> peers=new java.util.LinkedHashMap<>();
    private synchronized boolean allowPeer(String key){
        long minute=System.currentTimeMillis()/60000;
        if(peers.size()>=10000){java.util.Iterator<long[]> values=peers.values().iterator();while(values.hasNext())if(values.next()[0]<minute)values.remove();}
        long[] window=peers.get(key);if(window==null){if(peers.size()>=10000)return false;window=new long[]{minute,0};peers.put(key,window);}
        if(window[0]!=minute){window[0]=minute;window[1]=0;}
        return ++window[1]<=policy.getPeerRequestsPerMinute();
    }
    public ApiRequestFilter(ApiPolicy policy){this.policy=policy;}
    public static class LimitExceeded extends IOException { public LimitExceeded(){super("Request body limit exceeded");} }
    public static class ComplexityExceeded extends IOException { public ComplexityExceeded(){super("JSON complexity limit exceeded");} }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        String requestId=UUID.randomUUID().toString();
        request.setAttribute("api.requestId",requestId); response.setHeader("X-Request-ID",requestId);
        response.setHeader("Cache-Control","no-store");
        response.setHeader("X-Content-Type-Options","nosniff"); response.setHeader("Referrer-Policy","no-referrer");
        if(!request.getRequestURI().equals("/api/v1/health")&&!request.getRequestURI().equals("/actuator/health")&&!"OPTIONS".equals(request.getMethod())&&!allowPeer(request.getRemoteAddr())){
            response.setHeader("Retry-After",String.valueOf(60-System.currentTimeMillis()/1000%60));ApiErrors.write(request,response,429,"rate_limited","请求过于频繁，请稍后再试");return;
        }
        if(request.getContentLengthLong()>policy.getMaxRequestBytes()){
            ApiErrors.write(request,response,413,"payload_too_large","请求内容超过大小限制");return;
        }
        final ServletInputStream original=request.getInputStream();
        final int maximum=policy.getMaxRequestBytes();
        ServletInputStream limited=new ServletInputStream(){
            private long count;
            private int depth,items;
            private boolean quoted,escaped;
            private void add(int n)throws IOException{if(n>0&&(count+=n)>maximum)throw new LimitExceeded();}
            private void inspect(int value)throws IOException{
                if(quoted){if(escaped)escaped=false;else if(value=='\\')escaped=true;else if(value=='"')quoted=false;return;}
                if(value=='"'){quoted=true;return;}
                if(value=='{'||value=='['){if(++depth>64)throw new ComplexityExceeded();}
                else if(value=='}'||value==']')depth--;
                if(value==','||value=='{'||value=='[')if(++items>500000)throw new ComplexityExceeded();
            }
            @Override public int read()throws IOException{int value=original.read();if(value>=0){add(1);inspect(value);}return value;}
            @Override public int read(byte[] bytes,int offset,int length)throws IOException{int n=original.read(bytes,offset,(int)Math.min(length,maximum-count+1));add(n);for(int i=0;i<n;i++)inspect(bytes[offset+i]&255);return n;}
            @Override public boolean isFinished(){return original.isFinished();}
            @Override public boolean isReady(){return original.isReady();}
            @Override public void setReadListener(ReadListener listener){original.setReadListener(listener);}
            @Override public void close()throws IOException{original.close();}
        };
        HttpServletRequestWrapper wrapped=new HttpServletRequestWrapper(request){
            @Override public ServletInputStream getInputStream(){return limited;}
            @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(limited,StandardCharsets.UTF_8));}
        };
        long started=System.nanoTime();
        try{chain.doFilter(wrapped,response);}
        finally{
            if(request.getRequestURI().startsWith("/api/")&&!request.getRequestURI().endsWith("/health")){
                Object route=request.getAttribute(org.springframework.web.servlet.HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
                org.slf4j.LoggerFactory.getLogger(ApiRequestFilter.class).info("api requestId={} method={} route={} status={} elapsedMs={}",requestId,request.getMethod(),route==null?"unmatched":route,response.getStatus(),(System.nanoTime()-started)/1000000);
            }
        }
    }
}
