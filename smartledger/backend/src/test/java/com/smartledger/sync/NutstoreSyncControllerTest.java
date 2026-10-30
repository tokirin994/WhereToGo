package com.smartledger.sync;

import com.fasterxml.jackson.databind.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class NutstoreSyncControllerTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private final Jwt jwt=Jwt.withTokenValue("test-token").header("alg","RS256").subject("test-user").issuer("https://identity.example/realm").build();
    private final byte[] nativeBytes="{\"schema_version\":2,\"books\":[],\"categories\":[],\"transactions\":[],\"budgets\":[]}".getBytes(StandardCharsets.UTF_8);
    private NutstoreSyncController controller() {
        CredentialVault vault=mock(CredentialVault.class);when(vault.load(any())).thenReturn(new NutstoreSyncController.Credentials());
        return spy(new NutstoreSyncController(mapper,vault));
    }
    private NutstoreSyncController.UploadRequest request()throws Exception{
        NutstoreSyncController.UploadRequest request=new NutstoreSyncController.UploadRequest();request.setSnapshot(mapper.readTree(nativeBytes));return request;
    }
    @Test void downloadsAndConvertsNativeSnapshot()throws Exception{
        NutstoreSyncController c=controller();
        doReturn(new NutstoreSyncController.DavResult(200,nativeBytes,"\"old\"" )).when(c).exchange(anyString(),eq("GET"),any(),isNull(),isNull(),isNull(),anyMap());
        assertEquals(4,c.download(jwt).path("schemaVersion").asInt());
        assertTrue(NutstoreSyncController.relativeSnapshotPath(jwt).matches("SmartLedger/snapshot-[a-f0-9]{64}\\.json"));
    }
    @Test void archivesOriginalBytesBeforeReplacingAndUsesEtag()throws Exception{
        NutstoreSyncController c=controller();List<String> operations=new ArrayList<>();
        doAnswer(call->{
            String path=call.getArgument(0),method=call.getArgument(1);operations.add(method+" "+(path.contains("/history/")?"history":"current"));
            if(method.equals("GET"))return new NutstoreSyncController.DavResult(200,nativeBytes,"\"old\"");
            if(method.equals("PUT")&&path.contains("/history/"))assertArrayEquals(nativeBytes,call.getArgument(3));
            if(method.equals("PUT")&&!path.contains("/history/")){
                assertEquals("\"old\"",((Map<?,?>)call.getArgument(6)).get("If-Match"));
                assertEquals(4,mapper.readTree((byte[])call.getArgument(3)).path("schemaVersion").asInt());
            }
            return new NutstoreSyncController.DavResult(201,new byte[0],null);
        }).when(c).exchange(anyString(),anyString(),any(),nullable(byte[].class),nullable(String.class),nullable(String.class),anyMap());
        c.upload(jwt,request());assertEquals(Arrays.asList("MKCOL current","GET current","MKCOL history","PUT history","PUT current"),operations);
    }
    @Test void archiveFailureNeverOverwritesCurrentFile()throws Exception{
        NutstoreSyncController c=controller();List<String> writes=new ArrayList<>();
        doAnswer(call->{String path=call.getArgument(0),method=call.getArgument(1);
            if(method.equals("GET"))return new NutstoreSyncController.DavResult(200,nativeBytes,"\"old\"");
            if(method.equals("PUT")){writes.add(path);return new NutstoreSyncController.DavResult(507,new byte[0],null);}
            return new NutstoreSyncController.DavResult(201,new byte[0],null);
        }).when(c).exchange(anyString(),anyString(),any(),nullable(byte[].class),nullable(String.class),nullable(String.class),anyMap());
        assertThrows(ResponseStatusException.class,()->c.upload(jwt,request()));assertEquals(1,writes.size());assertTrue(writes.get(0).contains("/history/"));
    }
    @Test void newFileUsesCreateOnlyPrecondition()throws Exception{
        NutstoreSyncController c=controller();
        doAnswer(call->{String method=call.getArgument(1);
            if(method.equals("GET"))return new NutstoreSyncController.DavResult(404,new byte[0],null);
            if(method.equals("PUT"))assertEquals("*",((Map<?,?>)call.getArgument(6)).get("If-None-Match"));
            return new NutstoreSyncController.DavResult(201,new byte[0],null);
        }).when(c).exchange(anyString(),anyString(),any(),nullable(byte[].class),nullable(String.class),nullable(String.class),anyMap());
        c.upload(jwt,request());
    }
}
