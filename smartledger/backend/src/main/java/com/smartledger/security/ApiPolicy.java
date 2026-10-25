package com.smartledger.security;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import javax.validation.constraints.Min;
import javax.validation.constraints.Max;

@Component
@Validated
@ConfigurationProperties(prefix = "api.security")
public class ApiPolicy {
    private String issuer = "";
    private String audience = "";
    private String jwkSetUri = "";
    private boolean localDevelopment;
    private boolean allowAnyAuthenticatedUser;
    private List<String> allowedOrigins = new ArrayList<>();
    private List<String> allowedSubjects = new ArrayList<>();
    @Min(1024) @Max(33554432) private int maxRequestBytes = 1048576;
    @Min(1) @Max(100000) private int requestsPerMinute = 120;
    @Min(1) @Max(100000) private int writesPerMinute = 30;
    @Min(1) @Max(100000) private int peerRequestsPerMinute = 600;
    @Min(1) @Max(1000) private int webdavRequestsPerMinute = 10;
    public String getIssuer(){return issuer;} public void setIssuer(String v){issuer=v;}
    public String getAudience(){return audience;} public void setAudience(String v){audience=v;}
    public String getJwkSetUri(){return jwkSetUri;} public void setJwkSetUri(String v){jwkSetUri=v;}
    public boolean isLocalDevelopment(){return localDevelopment;} public void setLocalDevelopment(boolean v){localDevelopment=v;}
    public boolean isAllowAnyAuthenticatedUser(){return allowAnyAuthenticatedUser;} public void setAllowAnyAuthenticatedUser(boolean v){allowAnyAuthenticatedUser=v;}
    public List<String> getAllowedOrigins(){return allowedOrigins;} public void setAllowedOrigins(List<String> v){allowedOrigins=v;}
    public List<String> getAllowedSubjects(){return allowedSubjects;} public void setAllowedSubjects(List<String> v){allowedSubjects=v;}
    public int getMaxRequestBytes(){return maxRequestBytes;} public void setMaxRequestBytes(int v){maxRequestBytes=v;}
    public int getRequestsPerMinute(){return requestsPerMinute;} public void setRequestsPerMinute(int v){requestsPerMinute=v;}
    public int getWritesPerMinute(){return writesPerMinute;} public void setWritesPerMinute(int v){writesPerMinute=v;}
    public int getPeerRequestsPerMinute(){return peerRequestsPerMinute;} public void setPeerRequestsPerMinute(int v){peerRequestsPerMinute=v;}
    public int getWebdavRequestsPerMinute(){return webdavRequestsPerMinute;} public void setWebdavRequestsPerMinute(int v){webdavRequestsPerMinute=v;}
}
