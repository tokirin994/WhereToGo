package com.smartledger.sync;

import java.util.Map;
import javax.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/sync/nutstore/credentials")
public class CredentialController {
    private final CredentialVault vault;
    public CredentialController(CredentialVault vault) { this.vault = vault; }
    @GetMapping public Map<String,Object> status(@AuthenticationPrincipal Jwt jwt) { return vault.status(jwt); }
    @PutMapping public Map<String,Object> save(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody NutstoreSyncController.Credentials credentials) {
        credentials.setUsername(credentials.getUsername().trim());
        vault.save(jwt, credentials); return vault.status(jwt);
    }
    @DeleteMapping public Map<String,Object> delete(@AuthenticationPrincipal Jwt jwt) { vault.delete(jwt); return vault.status(jwt); }
}
