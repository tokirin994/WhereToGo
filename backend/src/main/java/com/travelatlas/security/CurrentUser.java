package com.travelatlas.security;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class CurrentUser {
    private final JdbcTemplate jdbc; private final ApiPolicy policy;
    public CurrentUser(JdbcTemplate jdbc,ApiPolicy policy){this.jdbc=jdbc;this.policy=policy;}
    public UUID id(){
        org.springframework.web.context.request.RequestAttributes attributes=org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
        if(attributes!=null){Object cached=attributes.getAttribute("api.userId",0);if(cached instanceof UUID)return (UUID)cached;}
        Authentication authentication=SecurityContextHolder.getContext().getAuthentication();
        if(authentication==null||!(authentication.getPrincipal() instanceof Jwt))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        Jwt jwt=(Jwt)authentication.getPrincipal();String issuer=jwt.getIssuer().toString(),subject=jwt.getSubject();
        // Existing demo data is adopted only by the explicit loopback mock identity in local mode.
        if(policy.isLocalDevelopment()&&"local-demo-user".equals(subject))jdbc.update(
            "UPDATE users SET issuer=?, subject=? WHERE id='00000000-0000-0000-0000-000000000001' AND issuer IS NULL",issuer,subject);
        UUID id=jdbc.queryForObject("INSERT INTO users(id,display_name,issuer,subject) VALUES (?,?,?,?) " +
            "ON CONFLICT(issuer,subject) DO UPDATE SET subject=EXCLUDED.subject RETURNING id",UUID.class,UUID.randomUUID(),"个人用户",issuer,subject);
        if(attributes!=null)attributes.setAttribute("api.userId",id,0);
        return id;
    }
}
