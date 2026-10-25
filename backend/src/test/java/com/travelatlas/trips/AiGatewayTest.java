package com.travelatlas.trips;
import com.fasterxml.jackson.databind.*;
import com.travelatlas.common.ExternalJsonClient;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AiGatewayTest {
    final ObjectMapper json=new ObjectMapper();
    AiGateway gateway(String protocol,String field){return new AiGateway(mock(ExternalJsonClient.class),json,"https://provider.example/v1","test-key","chosen-model",protocol,field,"api-key",6000);}
    @Test void chatSupportsDeepseekAndGlmWithoutTemperature(){AiGateway g=gateway("chat-completions","max_tokens");JsonNode body=g.request("system","context");assertEquals("chosen-model",body.path("model").asText());assertEquals(6000,body.path("max_tokens").asInt());assertFalse(body.has("temperature"));assertFalse(body.path("stream").asBoolean());assertTrue(g.address().endsWith("/v1/chat/completions"));}
    @Test void openaiCompletionTokenCompatibility(){JsonNode body=gateway("chat-completions","max_completion_tokens").request("s","u");assertTrue(body.has("max_completion_tokens"));assertFalse(body.has("max_tokens"));}
    @Test void responsesUsesInstructionsAndDoesNotStore(){JsonNode body=gateway("responses","max_tokens").request("s","u");assertEquals("s",body.path("instructions").asText());assertEquals("u",body.path("input").asText());assertFalse(body.path("store").asBoolean());assertTrue(body.has("max_output_tokens"));}
    @Test void anthropicUsesTopLevelSystem(){JsonNode body=gateway("anthropic","max_tokens").request("s","u");assertEquals("s",body.path("system").asText());assertEquals(1,body.path("messages").size());}
    @Test void parsesChatTextAndRejectsTruncation()throws Exception{AiGateway g=gateway("chat-completions","max_tokens");assertEquals("{}",g.text(json.readTree("{\"choices\":[{\"message\":{\"content\":\"{}\"},\"finish_reason\":\"stop\"}]}")));assertThrows(Exception.class,()->g.text(json.readTree("{\"choices\":[{\"finish_reason\":\"length\"}]}")));}
    @Test void ignoresAnthropicThinkingBlocks()throws Exception{assertEquals("{}",gateway("anthropic","max_tokens").text(json.readTree("{\"content\":[{\"type\":\"thinking\",\"thinking\":\"secret\"},{\"type\":\"text\",\"text\":\"{}\"}]}")));}
    @Test void parsesOnlyResponseMessageText()throws Exception{assertEquals("{}",gateway("responses","max_tokens").text(json.readTree("{\"status\":\"completed\",\"output\":[{\"type\":\"reasoning\"},{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"{}\"}]}]}")));}
    @Test void invalidAndIncompleteResponsesFailClosed()throws Exception{assertThrows(Exception.class,()->gateway("responses","max_tokens").text(json.readTree("{\"status\":\"incomplete\"}")));assertThrows(Exception.class,()->gateway("unknown","max_tokens").address());assertThrows(Exception.class,()->gateway("chat-completions","other").request("s","u"));}
}
