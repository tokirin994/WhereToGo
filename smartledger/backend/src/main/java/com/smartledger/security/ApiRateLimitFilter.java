package com.smartledger.security;

import java.io.IOException;
import java.net.InetAddress;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounded, single-instance guard; a shared gateway is required for a multi-instance quota. */
public final class ApiRateLimitFilter extends OncePerRequestFilter {
    private final ApiPolicy policy;
    private final Map<String,Window> windows=new LinkedHashMap<>();
    private static class Window{long minute;int count;Window(long minute){this.minute=minute;}}
    public ApiRateLimitFilter(ApiPolicy policy){this.policy=policy;}
    private synchronized boolean allow(String key,int limit){
        long minute=System.currentTimeMillis()/60000;
        if(windows.size()>=10000){Iterator<Window> iterator=windows.values().iterator();while(iterator.hasNext())if(iterator.next().minute<minute)iterator.remove();}
        Window value=windows.get(key);
        if(value==null){if(windows.size()>=10000)return false;value=new Window(minute);windows.put(key,value);}
        if(value.minute!=minute){value.minute=minute;value.count=0;}
        return ++value.count<=limit;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request){String path=request.getRequestURI();return "/api/v1/health".equals(path)||"/actuator/health".equals(path)||"OPTIONS".equals(request.getMethod());}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws IOException,ServletException{
        boolean loopback=false;try{loopback=InetAddress.getByName(request.getRemoteAddr()).isLoopbackAddress();}catch(Exception ignored){}
        // Never trust a client-provided X-Forwarded-For to authorize local development.
        boolean localHost="localhost".equals(request.getServerName())||"127.0.0.1".equals(request.getServerName())||"[::1]".equals(request.getServerName());
        if(policy.isLocalDevelopment()&&(!loopback||!localHost)){ApiErrors.write(request,response,403,"local_only","本地开发模式仅允许本机访问");return;}
        Authentication auth=SecurityContextHolder.getContext().getAuthentication();
        Jwt jwt=auth!=null&&auth.getPrincipal() instanceof Jwt?(Jwt)auth.getPrincipal():null;
        if(jwt!=null&&!policy.getAllowedSubjects().isEmpty()&&!policy.getAllowedSubjects().contains(jwt.getSubject())){
            ApiErrors.write(request,response,403,"account_not_allowed","当前账号未获准访问此服务");return;
        }
        String identity=jwt==null?null:jwt.getIssuer()+"|"+jwt.getSubject();
        boolean write=!"GET".equals(request.getMethod())&&!"HEAD".equals(request.getMethod());
        boolean accepted=true;
        if(identity!=null)accepted=accepted&&allow("user:"+identity,policy.getRequestsPerMinute());
        if(identity!=null&&write)accepted=accepted&&allow("write:"+identity,policy.getWritesPerMinute());
        if(identity!=null&&request.getRequestURI().startsWith("/api/v1/sync/nutstore"))accepted=accepted&&allow("dav:"+identity,policy.getWebdavRequestsPerMinute());
        if(!accepted){response.setHeader("Retry-After",String.valueOf(60-System.currentTimeMillis()/1000%60));ApiErrors.write(request,response,429,"rate_limited","请求过于频繁，请稍后再试");return;}
        chain.doFilter(request,response);
    }
}
