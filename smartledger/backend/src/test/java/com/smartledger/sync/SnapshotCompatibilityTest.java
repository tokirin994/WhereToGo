package com.smartledger.sync;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SnapshotCompatibilityTest {
    private final ObjectMapper mapper=new ObjectMapper();
    private ObjectNode nativeSnapshot()throws Exception{
        return (ObjectNode)mapper.readTree("{\"schema_version\":2,\"updatedAt\":\"2026-10-01T10:00:00Z\",\"categories\":[{\"id\":1,\"name\":\"Food\",\"flow_type\":\"expense\",\"children\":[{\"id\":2,\"name\":\"Lunch\",\"flow_type\":\"expense\",\"children\":[]}]}],\"books\":[{\"id\":3,\"name\":\"Trip\",\"participant_names\":[\"我\",\"Guest\"]}],\"transactions\":[{\"id\":4,\"title\":\"Lunch\",\"amount\":90.25,\"kind\":\"expense\",\"happened_at\":\"2026-09-01T12:30:00+08:00\",\"category_id\":2,\"book_ids\":[3],\"installment_group_id\":\"group-a\",\"installment_months\":3,\"installment_index\":1},{\"id\":5,\"title\":\"Refund\",\"amount\":10,\"kind\":\"income\",\"happened_at\":\"2026-09-01T12:30:00+08:00\",\"category_id\":2,\"source\":\"offset:4|manual\",\"offset_source_transaction_id\":4,\"book_ids\":[],\"book_id\":999}],\"transaction_ledger_links\":[{\"transaction_id\":4,\"ledger_id\":3,\"split_enabled\":true,\"split_mode\":\"equal\",\"split_participant_ids\":[\"我\",\"guest-id\"],\"payer_participant_id\":\"guest-id\",\"include_in_statistics\":true,\"participant_snapshot\":[{\"id\":\"我\",\"name\":\"我\"},{\"id\":\"guest-id\",\"name\":\"Guest\"}]}],\"budgets\":[{\"id\":6,\"name\":\"Monthly\",\"limitAmount\":200,\"period_type\":\"monthly\",\"startDate\":\"2026-09-01\",\"year\":2026}]}");
    }
    @Test void convertsNativeRecordsAndPreservesRelationships()throws Exception{
        ObjectNode original=nativeSnapshot();JsonNode result=SnapshotCompatibility.read(original);
        assertEquals(4,result.path("schemaVersion").asInt());assertFalse(original.has("schemaVersion"));
        assertEquals(2,result.path("categories").size());assertEquals("1",result.path("categories").get(1).path("parentId").asText());
        JsonNode tx=result.path("transactions").get(0),offset=result.path("transactions").get(1);
        assertEquals("4",tx.path("id").asText());assertTrue(tx.path("id").isTextual());
        assertEquals(90.25,tx.path("amount").asDouble());assertEquals("2026-09-01T12:30:00+08:00",tx.path("happenedAt").asText());
        assertEquals(3,tx.path("installmentMonths").asInt());assertEquals("group-a",tx.path("installmentGroupId").asText());
        assertEquals("guest-id",tx.path("ledgerSplitSettings").path("3").path("paidByParticipantId").asText());
        assertEquals("guest-id",result.path("books").get(0).path("participants").get(1).path("id").asText());
        assertEquals("4",offset.path("offsetSourceTransactionId").asText());assertEquals("offset:4|manual",offset.path("source").asText());
        assertEquals(0,offset.path("bookIds").size());assertEquals(9,result.path("budgets").get(0).path("month").asInt());
        assertFalse(result.path("settings").path("cloudSyncEnabled").asBoolean());
        SnapshotValidator.validate(result);
    }
    @Test void preservesCanonicalSnapshots()throws Exception{
        JsonNode canonical=SnapshotCompatibility.read(nativeSnapshot());assertSame(canonical,SnapshotCompatibility.read(canonical));
    }
    @Test void refusesUnknownVersionsAndSecrets()throws Exception{
        ObjectNode unknown=nativeSnapshot();unknown.put("schema_version",99);assertThrows(Exception.class,()->SnapshotCompatibility.read(unknown));
        ObjectNode secret=nativeSnapshot();secret.put("app_password","dummy-test-secret");assertThrows(Exception.class,()->SnapshotCompatibility.read(secret));
    }
    @Test void refusesDuplicateIdsAndBrokenLinks()throws Exception{
        ObjectNode duplicated=nativeSnapshot();((ArrayNode)duplicated.get("transactions")).add(duplicated.get("transactions").get(0).deepCopy());assertThrows(Exception.class,()->SnapshotCompatibility.read(duplicated));
        ObjectNode broken=nativeSnapshot();((ObjectNode)broken.get("transaction_ledger_links").get(0)).put("transaction_id",999);assertThrows(Exception.class,()->SnapshotCompatibility.read(broken));
    }
    @Test void refusesInvalidDatesAndAmounts()throws Exception{
        ObjectNode date=nativeSnapshot();((ObjectNode)date.get("transactions").get(0)).put("happened_at","bad-date");assertThrows(Exception.class,()->SnapshotCompatibility.read(date));
        ObjectNode amount=nativeSnapshot();((ObjectNode)amount.get("transactions").get(0)).put("amount",-1);assertThrows(Exception.class,()->SnapshotCompatibility.read(amount));
    }
    /** Local-only validation entrypoint. Input/output must stay outside Git. */
    public static void main(String[] args)throws Exception{
        ObjectMapper mapper=new ObjectMapper();JsonNode original=mapper.readTree(new java.io.File(args[0]));JsonNode converted=SnapshotCompatibility.read(original);
        mapper.writerWithDefaultPrettyPrinter().writeValue(new java.io.File(args[1]),converted);
        System.out.println("Converted snapshot: "+converted.path("transactions").size()+" transactions; "+converted.path("categories").size()+" categories; "+converted.path("books").size()+" books; "+converted.path("budgets").size()+" budgets");
    }
}
