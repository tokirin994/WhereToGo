package com.smartledger.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** AES-256-GCM with identity-bound associated data. Keys never live in database or browser. */
@Service
public class CredentialVault {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, SecretKeySpec> keys = new HashMap<>();
    private final String activeKeyId;

    public CredentialVault(JdbcTemplate jdbc, ObjectMapper mapper,
            @Value("${smartledger.credentials.key-file:}") String keyFile,
            @Value("${smartledger.credentials.keyring:}") String keyring) {
        this.jdbc = jdbc; this.mapper = mapper;
        if (keyFile.trim().isEmpty() && keyring.trim().isEmpty()) { activeKeyId = null; return; }
        try {
            JsonNode config = mapper.readTree(keyring.trim().isEmpty() ? Files.readAllBytes(Paths.get(keyFile)) : keyring.getBytes(StandardCharsets.UTF_8));
            activeKeyId = config.path("activeKeyId").asText();
            Iterator<Map.Entry<String, JsonNode>> entries = config.path("keys").fields();
            while (entries.hasNext()) {
                Map.Entry<String, JsonNode> entry = entries.next();
                if (!entry.getKey().matches("[a-zA-Z0-9_-]{1,80}")) throw new IllegalArgumentException();
                byte[] key = Base64.getDecoder().decode(entry.getValue().asText());
                if (key.length != 32) throw new IllegalArgumentException();
                keys.put(entry.getKey(), new SecretKeySpec(key, "AES"));
                Arrays.fill(key, (byte) 0);
            }
            if (!keys.containsKey(activeKeyId) || Cipher.getMaxAllowedKeyLength("AES") < 256) throw new IllegalArgumentException();
        } catch (Exception exception) { throw new IllegalStateException("Credential keyring is invalid; configure an external AES-256 keyring"); }
    }

    public boolean available() { return activeKeyId != null; }
    private void requireKey() { if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "管理员尚未配置凭证加密密钥"); }
    private UUID userId(Jwt jwt) {
        return jdbc.queryForObject("INSERT INTO sl_users(id, issuer, subject) VALUES (?, ?, ?) ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id",
            UUID.class, UUID.randomUUID(), jwt.getIssuer().toString(), jwt.getSubject());
    }
    private byte[] aad(Jwt jwt) { return ("smartledger:nutstore:v1\u0000" + jwt.getIssuer() + "\u0000" + jwt.getSubject()).getBytes(StandardCharsets.UTF_8); }

    public void save(Jwt jwt, NutstoreSyncController.Credentials credentials) {
        requireKey();
        byte[] plaintext = null;
        try {
            plaintext = mapper.writeValueAsBytes(credentials);
            byte[] nonce = new byte[12]; random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(jwt));
            String ciphertext = Base64.getEncoder().encodeToString(cipher.doFinal(plaintext));
            jdbc.update("INSERT INTO ledger_provider_credentials(user_id,key_id,nonce,ciphertext) VALUES (?,?,?,?) ON CONFLICT (user_id) DO UPDATE SET key_id=EXCLUDED.key_id,nonce=EXCLUDED.nonce,ciphertext=EXCLUDED.ciphertext,updated_at=now()",
                userId(jwt), activeKeyId, Base64.getEncoder().encodeToString(nonce), ciphertext);
        } catch (Exception exception) { throw new IllegalStateException("Unable to save encrypted provider credentials"); }
        finally { if (plaintext != null) Arrays.fill(plaintext, (byte) 0); }
    }

    public NutstoreSyncController.Credentials load(Jwt jwt) {
        requireKey();
        return jdbc.query("SELECT c.key_id,c.nonce,c.ciphertext FROM ledger_provider_credentials c JOIN sl_users u ON u.id=c.user_id WHERE u.issuer=? AND u.subject=?", rs -> {
            if (!rs.next()) throw new ResponseStatusException(HttpStatus.CONFLICT, "请先配置坚果云账号和第三方应用密码");
            byte[] plaintext = null;
            try {
                SecretKeySpec key = keys.get(rs.getString("key_id"));
                if (key == null) throw new IllegalStateException();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.getDecoder().decode(rs.getString("nonce"))));
                cipher.updateAAD(aad(jwt));
                plaintext = cipher.doFinal(Base64.getDecoder().decode(rs.getString("ciphertext")));
                return mapper.readValue(plaintext, NutstoreSyncController.Credentials.class);
            } catch (Exception exception) { throw new ResponseStatusException(HttpStatus.CONFLICT, "凭证无法解密，请检查服务器密钥或重新保存配置"); }
            finally { if (plaintext != null) Arrays.fill(plaintext, (byte) 0); }
        }, jwt.getIssuer().toString(), jwt.getSubject());
    }

    public Map<String,Object> status(Jwt jwt) {
        Map<String,Object> result = new java.util.LinkedHashMap<>();
        result.put("available", available()); result.put("configured", false);
        jdbc.query("SELECT c.updated_at FROM ledger_provider_credentials c JOIN sl_users u ON u.id=c.user_id WHERE u.issuer=? AND u.subject=?", rs -> {
            if (rs.next()) {
                result.put("configured", true); result.put("updatedAt", rs.getTimestamp(1).toInstant().toString());
            }
            return result;
        }, jwt.getIssuer().toString(), jwt.getSubject());
        if (Boolean.TRUE.equals(result.get("configured")) && available()) {
            try {
                String username = load(jwt).getUsername();
                int at = username.indexOf('@');
                result.put("usernameMasked", username.substring(0,1) + "***" + (at >= 0 ? username.substring(at) : ""));
            } catch (ResponseStatusException exception) { result.put("needsUpdate", true); }
        }
        return result;
    }
    public void delete(Jwt jwt) {
        jdbc.update("DELETE FROM ledger_provider_credentials WHERE user_id IN (SELECT id FROM sl_users WHERE issuer=? AND subject=?)", jwt.getIssuer().toString(), jwt.getSubject());
    }
}
