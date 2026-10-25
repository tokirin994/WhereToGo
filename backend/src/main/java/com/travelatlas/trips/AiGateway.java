package com.travelatlas.trips;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.travelatlas.common.ExternalJsonClient;
import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Protocol adapters; itinerary validation remains provider-independent in the planner. */
@Component
public class AiGateway {
    private final ExternalJsonClient http;private final ObjectMapper json;
    private final String base,key,model,protocol,tokenField,authMode;private final int maxTokens;
    @Value("${travel.ai.anthropic-version:2023-06-01}") private String anthropicVersion="2023-06-01";
    public AiGateway(ExternalJsonClient http,ObjectMapper json,
        @Value("${travel.ai.base-url:}") String base,@Value("${travel.ai.api-key:}") String key,
        @Value("${travel.ai.model:}") String model,@Value("${travel.ai.protocol:chat-completions}") String protocol,
        @Value("${travel.ai.token-field:max_tokens}") String tokenField,@Value("${travel.ai.auth-mode:api-key}") String authMode,
        @Value("${travel.ai.max-tokens:6000}") int maxTokens){this.http=http;this.json=json;this.base=base.trim();this.key=key.trim();this.model=model.trim();this.protocol=protocol;this.tokenField=tokenField;this.authMode=authMode;this.maxTokens=maxTokens;}
    public boolean configured(){return !base.isEmpty()&&!key.isEmpty()&&!model.isEmpty();}
    public String protocol(){return protocol;}
    String address(){
        URI uri=ExternalJsonClient.endpoint(base);
        if(uri.getQuery()!=null||!Arrays.asList("chat-completions","responses","anthropic").contains(protocol)||maxTokens<256||maxTokens>32000)throw config();
        String suffix="anthropic".equals(protocol)?"/messages":"responses".equals(protocol)?"/responses":"/chat/completions";
        String cleaned=base.replaceAll("/+$","");return cleaned.endsWith(suffix)?cleaned:cleaned+suffix;
    }
    ObjectNode request(String system,String context){
        ObjectNode request=json.createObjectNode();request.put("model",model);request.put("stream",false);
        if("responses".equals(protocol)){
            request.put("instructions",system);request.put("input",context);request.put("max_output_tokens",maxTokens);request.put("store",false);
        }else{
            ArrayNode messages=request.putArray("messages");
            if("anthropic".equals(protocol)){request.put("system",system);request.put("max_tokens",maxTokens);}
            else{if(!Arrays.asList("max_tokens","max_completion_tokens").contains(tokenField))throw config();request.put(tokenField,maxTokens);messages.addObject().put("role","system").put("content",system);}
            messages.addObject().put("role","user").put("content",context);
        }
        // Omit temperature/JSON-mode/tool fields: some reasoning models reject these parameters.
        return request;
    }
    String text(JsonNode body){
        if("responses".equals(protocol)){
            if(!"completed".equals(body.path("status").asText("completed")))throw invalid();
            StringBuilder out=new StringBuilder();for(JsonNode message:body.path("output"))if("message".equals(message.path("type").asText()))for(JsonNode content:message.path("content"))if("output_text".equals(content.path("type").asText()))out.append(content.path("text").asText());return nonempty(out.toString());
        }
        if("anthropic".equals(protocol)){
            if("max_tokens".equals(body.path("stop_reason").asText()))throw invalid();
            StringBuilder out=new StringBuilder();for(JsonNode content:body.path("content"))if("text".equals(content.path("type").asText()))out.append(content.path("text").asText());return nonempty(out.toString());
        }
        JsonNode choice=body.path("choices").path(0);if("length".equals(choice.path("finish_reason").asText()))throw invalid();
        JsonNode content=choice.path("message").path("content");if(content.isTextual())return nonempty(content.asText());
        StringBuilder out=new StringBuilder();if(content.isArray())for(JsonNode item:content)if("text".equals(item.path("type").asText()))out.append(item.path("text").asText());return nonempty(out.toString());
    }
    public String generate(String system,String context){
        if(!configured())throw new ResponseStatusException(HttpStatus.CONFLICT,"请先配置 AI 服务的协议、地址、模型和服务端密钥");
        Map<String,String> headers=new HashMap<>();
        if("anthropic".equals(protocol)){headers.put("anthropic-version",anthropicVersion);if("bearer".equals(authMode))headers.put("Authorization","Bearer "+key);else if("api-key".equals(authMode))headers.put("x-api-key",key);else throw config();}
        else headers.put("Authorization","Bearer "+key);
        return text(http.send(address(),request(system,context),headers,60000,524288)).trim().replaceAll("(?s)^```(?:json)?\\s*|\\s*```$","");
    }
    private String nonempty(String value){if(value.trim().isEmpty())throw invalid();return value;}
    private ResponseStatusException config(){return new ResponseStatusException(HttpStatus.CONFLICT,"AI 协议或参数配置无效，请检查服务端设置");}
    private ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.BAD_GATEWAY,"AI 返回内容为空或被截断，原行程未修改");}
}
