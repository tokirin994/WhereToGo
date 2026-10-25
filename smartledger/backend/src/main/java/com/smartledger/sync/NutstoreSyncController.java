package com.smartledger.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.HttpEntityEnclosingRequest;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpRequestBase;
import org.apache.http.client.methods.HttpEntityEnclosingRequestBase;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.entity.ByteArrayEntity;
import org.apache.http.util.EntityUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/** Resolves encrypted per-user WebDAV credentials on the server. */
@RestController
@RequestMapping("/api/v1/sync/nutstore")
public class NutstoreSyncController {
    private static final String DAV_ROOT = "https://dav.jianguoyun.com/dav/";
    private static final String SNAPSHOT_DIRECTORY = DAV_ROOT + "SmartLedger/";
    private static final int MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
    private final ObjectMapper mapper;
    private final CredentialVault vault;

    public NutstoreSyncController(ObjectMapper mapper, CredentialVault vault) { this.mapper = mapper; this.vault = vault; }

    @PostMapping("/test")
    public TestResponse test(@AuthenticationPrincipal Jwt jwt) {
        Credentials credentials = vault.load(jwt);
        DavResult result = exchange(DAV_ROOT, "PROPFIND", credentials, null, "application/xml", "0");
        if (result.status != 207 && result.status != 200) throw davError(result.status);
        return new TestResponse("坚果云 WebDAV 连接成功");
    }

    @PostMapping("/upload")
    public MessageResponse upload(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UploadRequest request) {
        Credentials credentials = vault.load(jwt);
        SnapshotValidator.validate(request.getSnapshot());
        if (request.getSnapshot() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Snapshot is required");
        byte[] body;
        try { body = mapper.writeValueAsBytes(request.getSnapshot()); }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid snapshot"); }
        if (body.length > MAX_SNAPSHOT_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Snapshot exceeds 10 MB");

        DavResult directory = exchange(SNAPSHOT_DIRECTORY, "MKCOL", credentials, null, null, null);
        if (directory.status != 201 && directory.status != 405) throw davError(directory.status);
        DavResult result = exchange(snapshotPath(jwt), "PUT", credentials, body, "application/json; charset=utf-8", null);
        if (result.status < 200 || result.status >= 300) throw davError(result.status);
        return new MessageResponse("账本快照已备份到坚果云");
    }

    @PostMapping("/download")
    public JsonNode download(@AuthenticationPrincipal Jwt jwt) {
        Credentials credentials = vault.load(jwt);
        DavResult result = exchange(snapshotPath(jwt), "GET", credentials, null, null, null);
        if (result.status == 404) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "坚果云中还没有 SmartLedger 快照");
        if (result.status < 200 || result.status >= 300) throw davError(result.status);
        if (result.body.length > MAX_SNAPSHOT_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Snapshot exceeds 10 MB");
        try { JsonNode snapshot=mapper.readTree(result.body);SnapshotValidator.validate(snapshot);return snapshot; }
        catch (ResponseStatusException exception) { throw exception; }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "坚果云中的快照不是有效 JSON"); }
    }

    private DavResult exchange(String target, String method, Credentials credentials, byte[] body, String contentType, String depth) {
        org.apache.http.client.config.RequestConfig limits=org.apache.http.client.config.RequestConfig.custom().setConnectTimeout(5000).setConnectionRequestTimeout(5000).setSocketTimeout(20000).build();
        try (CloseableHttpClient client = HttpClients.custom().setDefaultRequestConfig(limits).disableRedirectHandling().disableAutomaticRetries().build()) {
            HttpRequestBase request = new DavRequest(method, URI.create(target));
            String rawCredentials = credentials.getUsername().trim() + ":" + credentials.getAppPassword();
            request.setHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString(rawCredentials.getBytes(StandardCharsets.UTF_8)));
            request.setHeader("User-Agent", "SmartLedger/1.0 WebDAV backup");
            if (contentType != null) request.setHeader("Content-Type", contentType);
            if (depth != null) request.setHeader("Depth", depth);
            if (body != null && request instanceof HttpEntityEnclosingRequest) {
                ((HttpEntityEnclosingRequestBase) request).setEntity(new ByteArrayEntity(body));
            }
            try (CloseableHttpResponse response = client.execute(request)) {
                byte[] bytes = readBounded(response.getEntity());
                return new DavResult(response.getStatusLine().getStatusCode(), bytes);
            }
        } catch (ResponseStatusException exception) { throw exception; }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "坚果云 WebDAV 请求失败，请检查网络和服务端证书"); }
    }

    private byte[] readBounded(org.apache.http.HttpEntity entity)throws java.io.IOException{
        if(entity==null)return new byte[0];
        if(entity.getContentLength()>MAX_SNAPSHOT_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"坚果云响应超过大小限制");
        try(java.io.InputStream input=entity.getContent();java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int total=0,count;
            while((count=input.read(buffer))!=-1){total+=count;if(total>MAX_SNAPSHOT_BYTES)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"坚果云响应超过大小限制");output.write(buffer,0,count);}
            return output.toByteArray();
        }
    }

    private ResponseStatusException davError(int status) {
        if (status == 401 || status == 403) return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "坚果云账号或第三方应用密码无效");
        if (status == 404) return new ResponseStatusException(HttpStatus.NOT_FOUND, "坚果云快照文件不存在");
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "坚果云 WebDAV 返回状态 " + status);
    }

    private String snapshotPath(Jwt jwt) {
        try {
            String identity = String.valueOf(jwt.getIssuer()) + "|" + jwt.getSubject();
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte value : digest) hex.append(String.format("%02x", value & 0xff));
            return SNAPSHOT_DIRECTORY + "snapshot-" + hex + ".json";
        } catch (Exception exception) { throw new IllegalStateException("Unable to hash user identity", exception); }
    }

    private static class DavRequest extends HttpEntityEnclosingRequestBase {
        private final String method;
        DavRequest(String method, URI uri) { this.method = method; setURI(uri); }
        @Override public String getMethod() { return method; }
    }

    private static class DavResult {
        final int status; final byte[] body;
        DavResult(int status, byte[] body) { this.status = status; this.body = body; }
    }

    public static class Credentials {
        @NotBlank @javax.validation.constraints.Email @Size(max = 254) private String username;
        @NotBlank @Size(max = 256) private String appPassword;
        public Credentials() { }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getAppPassword() { return appPassword; }
        public void setAppPassword(String appPassword) { this.appPassword = appPassword; }
    }

    public static class UploadRequest {
        @NotNull private JsonNode snapshot;
        public UploadRequest() { }
        public JsonNode getSnapshot() { return snapshot; }
        public void setSnapshot(JsonNode snapshot) { this.snapshot = snapshot; }
    }

    public static class TestResponse {
        private final String message;
        public TestResponse(String message) { this.message = message; }
        public String getMessage() { return message; }
    }

    public static class MessageResponse {
        private final String message;
        public MessageResponse(String message) { this.message = message; }
        public String getMessage() { return message; }
    }
}
