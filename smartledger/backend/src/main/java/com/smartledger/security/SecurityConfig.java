package com.smartledger.security;

import java.net.URI;
import java.util.Arrays;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.*;

@Configuration
public class SecurityConfig {
    private static void requireUrl(String value,boolean local,String name){
        URI uri;try{uri=URI.create(value);}catch(Exception e){throw new IllegalStateException(name+" must be an absolute trusted URL");}
        boolean loopback="localhost".equals(uri.getHost())||"127.0.0.1".equals(uri.getHost())||"[::1]".equals(uri.getHost());
        if(uri.getHost()==null||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getQuery()!=null||(!"https".equals(uri.getScheme())&&!(local&&loopback&&"http".equals(uri.getScheme()))))
            throw new IllegalStateException(name+" must use HTTPS (loopback HTTP requires explicit local development mode)");
        if(!local&&loopback)throw new IllegalStateException(name+" cannot use the development identity provider outside local mode");
    }
    @Bean JwtDecoder jwtDecoder(ApiPolicy policy){
        requireUrl(policy.getIssuer(),policy.isLocalDevelopment(),"API OIDC issuer");
        if(policy.getAudience().trim().isEmpty())throw new IllegalStateException("API audience must be configured");
        if(!policy.isLocalDevelopment()&&!policy.isAllowAnyAuthenticatedUser()&&policy.getAllowedSubjects().isEmpty())throw new IllegalStateException("Configure API_ALLOWED_SUBJECTS for a private deployment, or explicitly enable API_ALLOW_ANY_AUTHENTICATED_USER");
        NimbusJwtDecoder decoder;
        if(policy.getJwkSetUri().trim().isEmpty())decoder=(NimbusJwtDecoder)JwtDecoders.fromIssuerLocation(policy.getIssuer());
        else{requireUrl(policy.getJwkSetUri(),policy.isLocalDevelopment(),"API JWK set URI");decoder=NimbusJwtDecoder.withJwkSetUri(policy.getJwkSetUri()).jwsAlgorithm(SignatureAlgorithm.RS256).jwsAlgorithm(SignatureAlgorithm.ES256).build();}
        OAuth2TokenValidator<Jwt> claims=jwt->jwt.getAudience().contains(policy.getAudience())&&jwt.getExpiresAt()!=null&&jwt.getSubject()!=null&&!jwt.getSubject().trim().isEmpty()&&jwt.getSubject().length()<=255
            ?OAuth2TokenValidatorResult.success():OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Required token claims are missing",null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(policy.getIssuer()),claims));
        return decoder;
    }
    @Bean CorsConfigurationSource corsConfigurationSource(ApiPolicy policy){
        CorsConfiguration config=new CorsConfiguration();
        for(String origin:policy.getAllowedOrigins()){
            requireUrl(origin,policy.isLocalDevelopment(),"CORS origin");
            URI uri=URI.create(origin);if(origin.contains("*")||!(uri.getPath().isEmpty()||"/".equals(uri.getPath())))throw new IllegalStateException("CORS origins must be exact scheme://host:port values");
        }
        config.setAllowedOrigins(policy.getAllowedOrigins());config.setAllowedMethods(Arrays.asList("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
        config.setAllowedHeaders(Arrays.asList("Authorization","Content-Type","X-Request-ID"));config.setExposedHeaders(Arrays.asList("X-Request-ID","Retry-After"));
        config.setAllowCredentials(false);config.setMaxAge(600L);
        UrlBasedCorsConfigurationSource source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/**",config);return source;
    }
    @Bean SecurityFilterChain apiSecurity(HttpSecurity http,ApiPolicy policy)throws Exception{
        return http.csrf(csrf->csrf.disable()).cors(Customizer.withDefaults())
            .sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache->cache.disable()).httpBasic(basic->basic.disable()).formLogin(form->form.disable()).logout(logout->logout.disable())
            .authorizeRequests(auth->auth.antMatchers(HttpMethod.GET,"/api/v1/health","/actuator/health").permitAll()
                .antMatchers("/api/v1/**","/v3/api-docs/**","/swagger-ui/**","/swagger-ui.html").authenticated().anyRequest().denyAll())
            .exceptionHandling(errors->errors.authenticationEntryPoint((request,response,e)->ApiErrors.write(request,response,401,"unauthorized","请登录或重新登录"))
                .accessDeniedHandler((request,response,e)->ApiErrors.write(request,response,403,"forbidden","当前操作未获授权")))
            .oauth2ResourceServer(oauth->oauth.jwt(Customizer.withDefaults()).authenticationEntryPoint((request,response,e)->ApiErrors.write(request,response,401,"invalid_token","登录凭证无效或已过期")))
            .addFilterBefore(new ApiRequestFilter(policy),BearerTokenAuthenticationFilter.class)
            .addFilterAfter(new ApiRateLimitFilter(policy),BearerTokenAuthenticationFilter.class).build();
    }
}
