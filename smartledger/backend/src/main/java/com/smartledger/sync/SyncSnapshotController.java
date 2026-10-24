package com.smartledger.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import javax.validation.Valid;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/sync/snapshot")
public class SyncSnapshotController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    public SyncSnapshotController(JdbcTemplate jdbc, ObjectMapper objectMapper) { this.jdbc = jdbc; this.objectMapper = objectMapper; }

    @GetMapping
    public SnapshotResponse get(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = userId(jwt);
        return jdbc.query("SELECT schema_version, revision, content_hash, snapshot, updated_at FROM ledger_sync_snapshots WHERE user_id = ?",
            rs -> rs.next()
                ? new SnapshotResponse(rs.getInt("schema_version"), rs.getLong("revision"), rs.getString("content_hash"),
                    parseSnapshot(rs.getString("snapshot")), rs.getTimestamp("updated_at").toInstant().toString())
                : new SnapshotResponse(1, 0, null, null, null), userId);
    }

    @PutMapping
    @Transactional
    public SnapshotResponse put(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SnapshotWrite request) {
        UUID userId = userId(jwt);
        String body;
        try { body = objectMapper.writeValueAsString(request.getSnapshot()); }
        catch (Exception exception) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid snapshot JSON"); }
        if (body.getBytes(StandardCharsets.UTF_8).length > 10 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Snapshot exceeds 10 MB");
        }
        String hash = sha256(body);
        Long newRevision;
        if (request.getExpectedRevision() == 0) {
            newRevision = jdbc.query("INSERT INTO ledger_sync_snapshots(user_id, schema_version, revision, content_hash, snapshot) " +
                "VALUES (?, ?, 1, ?, ?::jsonb) ON CONFLICT (user_id) DO UPDATE SET schema_version = EXCLUDED.schema_version, " +
                "revision = ledger_sync_snapshots.revision + 1, content_hash = EXCLUDED.content_hash, snapshot = EXCLUDED.snapshot, " +
                "updated_at = now() WHERE ledger_sync_snapshots.revision = 0 RETURNING revision",
                rs -> rs.next() ? rs.getLong(1) : null, userId, request.getSchemaVersion(), hash, body);
        } else {
            newRevision = jdbc.query("UPDATE ledger_sync_snapshots SET schema_version = ?, revision = revision + 1, " +
                "content_hash = ?, snapshot = ?::jsonb, updated_at = now() WHERE user_id = ? AND revision = ? RETURNING revision",
                rs -> rs.next() ? rs.getLong(1) : null, request.getSchemaVersion(), hash, body, userId, request.getExpectedRevision());
        }
        if (newRevision == null) {
            Long actual = jdbc.query("SELECT revision FROM ledger_sync_snapshots WHERE user_id = ?", rs -> rs.next() ? rs.getLong(1) : 0L, userId);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cloud snapshot revision is " + actual);
        }
        return new SnapshotResponse(request.getSchemaVersion(), newRevision, hash, request.getSnapshot(), Instant.now().toString());
    }

    private UUID userId(Jwt jwt) {
        return jdbc.queryForObject("INSERT INTO sl_users(id, issuer, subject) VALUES (?, ?, ?) " +
            "ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id",
            UUID.class, UUID.randomUUID(), jwt.getIssuer().toString(), jwt.getSubject());
    }

    private String sha256(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) result.append(String.format("%02x", value & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    private JsonNode parseSnapshot(String value) {
        try { return objectMapper.readTree(value); }
        catch (Exception exception) { throw new IllegalStateException("Stored snapshot JSON is invalid", exception); }
    }

    public static class SnapshotWrite {
        @Min(1) private int schemaVersion;
        @Min(0) private long expectedRevision;
        @NotNull private JsonNode snapshot;
        public SnapshotWrite() { }
        public int getSchemaVersion() { return schemaVersion; } public void setSchemaVersion(int v) { schemaVersion=v; }
        public long getExpectedRevision() { return expectedRevision; } public void setExpectedRevision(long v) { expectedRevision=v; }
        public JsonNode getSnapshot() { return snapshot; } public void setSnapshot(JsonNode v) { snapshot=v; }
    }

    public static class SnapshotResponse {
        private final int schemaVersion; private final long revision; private final String contentHash;
        private final JsonNode snapshot; private final String updatedAt;
        public SnapshotResponse(int schemaVersion, long revision, String contentHash, JsonNode snapshot, String updatedAt) {
            this.schemaVersion=schemaVersion; this.revision=revision; this.contentHash=contentHash; this.snapshot=snapshot; this.updatedAt=updatedAt;
        }
        public int getSchemaVersion() { return schemaVersion; } public long getRevision() { return revision; }
        public String getContentHash() { return contentHash; } public JsonNode getSnapshot() { return snapshot; }
        public String getUpdatedAt() { return updatedAt; }
    }
}
