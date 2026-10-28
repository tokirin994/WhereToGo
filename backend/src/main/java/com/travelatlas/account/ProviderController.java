package com.travelatlas.account;

import com.fasterxml.jackson.databind.*;
import com.travelatlas.common.ExternalJsonClient;
import com.travelatlas.trips.AiGateway;
import java.net.URLEncoder;
import java.util.*;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/account/providers")
public class ProviderController {
    private final ProviderVault vault;private final ExternalJsonClient http;private final ObjectMapper json;
    public ProviderController(ProviderVault vault,ExternalJsonClient http,ObjectMapper json){this.vault=vault;this.http=http;this.json=json;}
    @GetMapping public Map<String,Object> list(){return vault.status();}
    @PutMapping("/{provider}") public Map<String,Object> save(@PathVariable String provider,@Valid @RequestBody ProviderVault.Input input){vault.save(provider,input);return vault.status();}
    @DeleteMapping("/{provider}") public Map<String,Object> delete(@PathVariable String provider){vault.delete(provider);return vault.status();}
    @PostMapping("/{provider}/test") public Map<String,Object> test(@PathVariable String provider)throws Exception{
        JsonNode config=vault.load(provider);if(config==null)throw new ResponseStatusException(HttpStatus.CONFLICT,"请先保存此服务的配置");
        if("amap".equals(provider)){
            JsonNode result=http.send("https://restapi.amap.com/v3/config/district?keywords="+URLEncoder.encode("北京","UTF-8")+"&key="+URLEncoder.encode(config.path("apiKey").asText(),"UTF-8"),null,Collections.emptyMap(),15000,262144);
            if(!"1".equals(result.path("status").asText()))throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"高德 Key 验证未通过，请检查 Web 服务类型、配额与 IP 白名单");
        }else AiGateway.forAccount(http,json,config,256).generate("Reply with OK.","Connection check.");
        Map<String,Object> result=new LinkedHashMap<>();result.put("message","连接测试成功");return result;
    }
}
