package com.travelatlas.common;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {
    @GetMapping
    public Map<String, Object> health() {
        Map<String, Object> response = new HashMap<String, Object>();
        response.put("status", "UP");
        response.put("service", "travelatlas-api");
        response.put("time", Instant.now());
        return response;
    }
}
