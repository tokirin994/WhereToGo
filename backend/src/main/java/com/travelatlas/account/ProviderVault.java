package com.travelatlas.account;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.travelatlas.common.ExternalJsonClient;
import com.travelatlas.security.CurrentUser;
import java.util.*;
import javax.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProviderVault {
    public static final List<String> PROVIDERS=Arrays.asList("deepseek","glm","openai","anthropic","custom-ai","amap");
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final CurrentUser user;private final ProviderCipher cipher;
    public ProviderVault(JdbcTemplate jdbc,ObjectMapper json,CurrentUser user,@Value("${TRAVEL_CREDENTIAL_KEY_FILE:}") String keyFile){this.jdbc=jdbc;this.json=json;this.user=user;this.cipher=new ProviderCipher(keyFile,json);}
    private void provider(String name){if(!PROVIDERS.contains(name))throw bad("不支持的服务类型");}
    private Jwt jwt(){Object principal=SecurityContextHolder.getContext().getAuthentication().getPrincipal();if(!(principal instanceof Jwt))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);return (Jwt)principal;}
    private String aad(String provider){Jwt jwt=jwt();return "wheretogo:provider:v1\u0000"+jwt.getIssuer()+"\u0000"+jwt.getSubject()+"\u0000"+provider;}
    private void requireKey(){if(cipher.activeKeyId==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"服务器尚未配置服务凭据加密密钥");}
    public JsonNode load(String provider){
        provider(provider);requireKey();
        return jdbc.query("SELECT key_id,nonce,ciphertext FROM account_provider_credentials WHERE user_id=? AND provider=?",rs->{
            if(!rs.next())return null;byte[] plain=null;
            try{plain=cipher.decrypt(aad(provider),rs.getString(1),rs.getString(2),rs.getString(3));return json.readTree(plain);}
            catch(Exception error){throw new ResponseStatusException(HttpStatus.CONFLICT,"凭据无法解密，请恢复加密密钥或重新配置");}
            finally{if(plain!=null)Arrays.fill(plain,(byte)0);}
        },user.id(),provider);
    }
    public JsonNode current(String type){
        if(cipher.activeKeyId==null)return null;
        Object auth=SecurityContextHolder.getContext().getAuthentication();if(auth==null)return null;
        List<String> rows=jdbc.queryForList("SELECT provider FROM account_provider_credentials WHERE user_id=? AND enabled AND "+("ai".equals(type)?"provider <> 'amap'":"provider = 'amap'"),String.class,user.id());
        return rows.isEmpty()?null:load(rows.get(0));
    }
    public Map<String,Object> status(){
        Map<String,Object> out=new LinkedHashMap<>();out.put("available",cipher.activeKeyId!=null);out.put("encryption","AES-256-GCM");
        List<Map<String,Object>> rows=jdbc.query("SELECT provider,enabled,updated_at FROM account_provider_credentials WHERE user_id=? ORDER BY provider",(rs,n)->{
            String name=rs.getString(1);Map<String,Object> item=new LinkedHashMap<>();item.put("provider",name);item.put("enabled",rs.getBoolean(2));item.put("updatedAt",rs.getTimestamp(3).toInstant().toString());
            return item;
        },user.id());
        if(cipher.activeKeyId!=null)for(Map<String,Object> item:rows){try{
            JsonNode config=load((String)item.get("provider"));ObjectNode safe=((ObjectNode)config).deepCopy();String secret=safe.path("apiKey").asText();safe.remove("apiKey");
            item.put("config",safe);item.put("keyMasked","••••"+secret.substring(Math.max(0,secret.length()-4)));
        }catch(ResponseStatusException error){item.put("needsUpdate",true);}}
        out.put("providers",rows);return out;
    }
    @Transactional public void save(String name,Input input){
        provider(name);requireKey();UUID id=user.id();
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(?))","provider:"+id);
        String secret=input.apiKey.trim();JsonNode previous=null;
        try{previous=load(name);}catch(ResponseStatusException error){if(secret.isEmpty())throw error;}
        if(secret.isEmpty()){
            if(previous==null)throw bad("首次配置需要填写 API Key");
            if(!"amap".equals(name)&&!input.baseUrl.trim().equals(previous.path("baseUrl").asText()))throw bad("更换服务地址时请重新输入 API Key");
            secret=previous.path("apiKey").asText();
        }
        if(secret.length()<8||secret.matches("(?s).*\\s.*"))throw bad("API Key 格式无效，请检查是否误填空格或换行");
        ObjectNode config=json.createObjectNode();config.put("apiKey",secret);config.put("provider",name);
        if(!"amap".equals(name)){
            String base=input.baseUrl.trim();java.net.URI uri=ExternalJsonClient.endpoint(base);
            if(uri.getQuery()!=null||uri.getPort()!=-1&&uri.getPort()!=443||uri.getHost().matches("(?i)(localhost|.*\\.localhost|.*\\.local)")||uri.getHost().matches("[0-9.]+")||uri.getHost().contains(":"))throw bad("AI 地址需为公网 HTTPS 域名，不支持本机、内网地址或自定义端口");
            if(input.model.trim().isEmpty())throw bad("请填写模型名称");
            if(!Arrays.asList("chat-completions","responses","anthropic").contains(input.protocol)||!Arrays.asList("max_tokens","max_completion_tokens").contains(input.tokenField)||!Arrays.asList("api-key","bearer").contains(input.authMode))throw bad("AI 接口协议无效");
            config.put("baseUrl",base);config.put("model",input.model.trim());config.put("protocol",input.protocol);config.put("tokenField",input.tokenField);config.put("authMode",input.authMode);
        }
        byte[] plain=null;
        try{
            plain=json.writeValueAsBytes(config);String[] encoded=cipher.encrypt(aad(name),plain);
            if(input.enabled&&!"amap".equals(name))jdbc.update("UPDATE account_provider_credentials SET enabled=false WHERE user_id=? AND provider <> 'amap'",id);
            jdbc.update("INSERT INTO account_provider_credentials(user_id,provider,enabled,key_id,nonce,ciphertext) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET enabled=EXCLUDED.enabled,key_id=EXCLUDED.key_id,nonce=EXCLUDED.nonce,ciphertext=EXCLUDED.ciphertext,updated_at=now()",id,name,input.enabled,encoded[0],encoded[1],encoded[2]);
        }catch(Exception error){throw new IllegalStateException("Failed to encrypt provider settings");}finally{if(plain!=null)Arrays.fill(plain,(byte)0);}
    }
    public void delete(String name){provider(name);jdbc.update("DELETE FROM account_provider_credentials WHERE user_id=? AND provider=?",user.id(),name);}
    private ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    public static class Input {
        @NotNull @Size(max=4096) public String apiKey="";
        @NotNull @Size(max=500) public String baseUrl="";
        @NotNull @Size(max=180) public String model="";
        @NotNull @Size(max=32) public String protocol="chat-completions";
        @NotNull @Size(max=32) public String tokenField="max_tokens";
        @NotNull @Size(max=16) public String authMode="api-key";
        public boolean enabled=true;
    }
}
