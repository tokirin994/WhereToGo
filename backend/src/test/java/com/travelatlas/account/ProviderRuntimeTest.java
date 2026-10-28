package com.travelatlas.account;
import com.fasterxml.jackson.databind.*;
import com.travelatlas.common.ExternalJsonClient;
import com.travelatlas.trips.AiGateway;
import com.travelatlas.places.MapSearchController;
import java.net.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class ProviderRuntimeTest {
    @Test void privateAndMetadataAddressesCannotBeRequested()throws Exception{
        for(String address:new String[]{"127.0.0.1","10.0.0.1","172.29.231.2","192.168.1.1","169.254.169.254","100.64.0.1","::1","fd00::1"})assertFalse(ExternalJsonClient.publicAddress(InetAddress.getByName(address)),address);
        assertTrue(ExternalJsonClient.publicAddress(InetAddress.getByName("8.8.8.8")));
    }
    @Test void usesCurrentAccountsAiKeyAndModelInsteadOfGlobalCredentials()throws Exception{
        ObjectMapper json=new ObjectMapper();ExternalJsonClient http=mock(ExternalJsonClient.class);ProviderVault vault=mock(ProviderVault.class);
        when(vault.current("ai")).thenReturn(json.readTree("{\"apiKey\":\"personal-test-key\",\"baseUrl\":\"https://api.deepseek.com/v1\",\"model\":\"my-model\",\"protocol\":\"chat-completions\"}"));
        when(http.send(anyString(),any(),anyMap(),anyInt(),anyInt())).thenReturn(json.readTree("{\"choices\":[{\"message\":{\"content\":\"OK\"}}]}"));
        AiGateway gateway=new AiGateway(http,json,"","","","chat-completions","max_tokens","api-key",6000);ReflectionTestUtils.setField(gateway,"vault",vault);
        assertTrue(gateway.configured());assertEquals("OK",gateway.generate("system","context"));
        verify(http).send(eq("https://api.deepseek.com/v1/chat/completions"),argThat(body->body.path("model").asText().equals("my-model")),argThat(headers->headers.get("Authorization").equals("Bearer personal-test-key")),anyInt(),anyInt());
    }
    @Test void convertsGcj02ToWgs84RatherThanMislabelingCoordinates(){double[] converted=MapSearchController.gcjToWgs(116.403372,39.91793);assertEquals(116.397128,converted[0],.0001);assertEquals(39.916527,converted[1],.0001);assertArrayEquals(new double[]{-0.1,51.5},MapSearchController.gcjToWgs(-0.1,51.5));}
    @Test void rejectsInvalidMapCoordinates(){assertThrows(NumberFormatException.class,()->MapSearchController.gcjToWgs(Double.NaN,30));}
}
