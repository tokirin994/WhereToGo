package com.smartledger.security;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SystemInfoController {
    private final ApiPolicy policy; private final String service;
    public SystemInfoController(ApiPolicy policy,@Value("${spring.application.name}")String service){this.policy=policy;this.service=service;}
    @GetMapping("/api/v1/system/info") public Map<String,Object> info(){
        Map<String,Object> result=new LinkedHashMap<>();result.put("service",service);result.put("apiVersion","v1");
        result.put("authentication","OIDC JWT");result.put("localDevelopment",policy.isLocalDevelopment());
        result.put("accessPolicy",policy.getAllowedSubjects().isEmpty()?"authenticated-users":"account-allowlist");
        result.put("maxRequestBytes",policy.getMaxRequestBytes());result.put("requestsPerMinute",policy.getRequestsPerMinute());result.put("writesPerMinute",policy.getWritesPerMinute());
        result.put("rateLimitScope","single-instance");return result;
    }
}
