package com.smartledger.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

public final class ApiErrors {
    private static final ObjectMapper JSON = new ObjectMapper();
    private ApiErrors() { }
    public static Map<String,Object> body(HttpServletRequest request, int status, String code, String message) {
        Map<String,Object> body = new LinkedHashMap<>();
        body.put("status", status); body.put("code", code); body.put("message", message);
        body.put("requestId", request.getAttribute("api.requestId")); body.put("timestamp", Instant.now().toString());
        return body;
    }
    public static void write(HttpServletRequest request, HttpServletResponse response, int status, String code, String message) throws IOException {
        if(response.isCommitted())return;
        org.slf4j.LoggerFactory.getLogger(ApiErrors.class).warn("api rejection requestId={} status={} code={}",request.getAttribute("api.requestId"),status,code);
        response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        if(status==401)response.setHeader("WWW-Authenticate","Bearer");
        response.setHeader("Cache-Control", "no-store");
        JSON.writeValue(response.getOutputStream(), body(request,status,code,message));
    }
}
