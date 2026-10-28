package com.travelatlas.account;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class ProviderCipherTest {
    @TempDir Path folder;
    ProviderCipher cipher()throws Exception{byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);Path file=folder.resolve(UUID.randomUUID()+".json");Files.write(file,("{\"activeKeyId\":\"one\",\"keys\":{\"one\":\""+Base64.getEncoder().encodeToString(key)+"\"}}").getBytes(StandardCharsets.UTF_8));return new ProviderCipher(file.toString(),new ObjectMapper());}
    @Test void encryptsAndDecryptsWithoutStoringPlaintext()throws Exception{ProviderCipher cipher=cipher();String[] encrypted=cipher.encrypt("issuer|alice|deepseek","private-provider-key".getBytes(StandardCharsets.UTF_8));assertFalse(encrypted[2].contains("private-provider-key"));assertEquals("private-provider-key",new String(cipher.decrypt("issuer|alice|deepseek",encrypted[0],encrypted[1],encrypted[2]),StandardCharsets.UTF_8));}
    @Test void rejectsAnotherUserOrAnotherProvider()throws Exception{ProviderCipher cipher=cipher();String[] encrypted=cipher.encrypt("issuer|alice|deepseek",new byte[]{1,2,3});assertThrows(Exception.class,()->cipher.decrypt("issuer|bob|deepseek",encrypted[0],encrypted[1],encrypted[2]));assertThrows(Exception.class,()->cipher.decrypt("issuer|alice|openai",encrypted[0],encrypted[1],encrypted[2]));}
    @Test void usesFreshNonceForEverySave()throws Exception{ProviderCipher cipher=cipher();assertNotEquals(cipher.encrypt("alice",new byte[]{1})[1],cipher.encrypt("alice",new byte[]{1})[1]);}
    @Test void rejectsCiphertextTampering()throws Exception{ProviderCipher cipher=cipher();String[] encrypted=cipher.encrypt("alice",new byte[]{1});byte[] bytes=Base64.getDecoder().decode(encrypted[2]);bytes[0]^=1;assertThrows(Exception.class,()->cipher.decrypt("alice",encrypted[0],encrypted[1],Base64.getEncoder().encodeToString(bytes)));}
    @Test void supportsUnconfiguredVaultWithoutGeneratingOrExposingKeys(){assertNull(new ProviderCipher("",new ObjectMapper()).activeKeyId);}
}
