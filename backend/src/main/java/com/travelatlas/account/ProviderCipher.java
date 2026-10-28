package com.travelatlas.account;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Encryption key lives outside the database. AAD binds ciphertext to account and provider. */
public final class ProviderCipher {
    private final Map<String,SecretKeySpec> keys=new HashMap<>();
    private final SecureRandom random=new SecureRandom();
    public final String activeKeyId;
    public ProviderCipher(String file,ObjectMapper json){
        if(file.trim().isEmpty()){activeKeyId=null;return;}
        try{
            JsonNode config=json.readTree(Files.readAllBytes(Paths.get(file)));
            activeKeyId=config.path("activeKeyId").asText();
            Iterator<Map.Entry<String,JsonNode>> entries=config.path("keys").fields();
            while(entries.hasNext()){
                Map.Entry<String,JsonNode> entry=entries.next();byte[] bytes=Base64.getDecoder().decode(entry.getValue().asText());
                if(!entry.getKey().matches("[a-zA-Z0-9_-]{1,80}")||bytes.length!=32)throw new IllegalArgumentException();
                keys.put(entry.getKey(),new SecretKeySpec(bytes,"AES"));Arrays.fill(bytes,(byte)0);
            }
            if(!keys.containsKey(activeKeyId)||Cipher.getMaxAllowedKeyLength("AES")<256)throw new IllegalArgumentException();
        }catch(Exception error){throw new IllegalStateException("Invalid external provider encryption keyring");}
    }
    public String[] encrypt(String aad,byte[] plaintext)throws Exception{
        byte[] nonce=new byte[12];random.nextBytes(nonce);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,keys.get(activeKeyId),new GCMParameterSpec(128,nonce));
        cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
        return new String[]{activeKeyId,Base64.getEncoder().encodeToString(nonce),Base64.getEncoder().encodeToString(cipher.doFinal(plaintext))};
    }
    public byte[] decrypt(String aad,String keyId,String nonce,String ciphertext)throws Exception{
        if(!keys.containsKey(keyId))throw new IllegalArgumentException("Unknown encryption key");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,keys.get(keyId),new GCMParameterSpec(128,Base64.getDecoder().decode(nonce)));
        cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return cipher.doFinal(Base64.getDecoder().decode(ciphertext));
    }
}
