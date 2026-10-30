package com.smartledger.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Converts the native schema_version=2 export without regenerating records or IDs. */
final class SnapshotCompatibility {
    private SnapshotCompatibility() { }
    static JsonNode read(JsonNode input) {
        if(input==null||!input.isObject())throw invalid("账本快照必须为 JSON 对象");
        if(input.has("schemaVersion")){SnapshotValidator.validate(input);return input;}
        if(!input.path("schema_version").isIntegralNumber()||input.path("schema_version").asInt()!=2)
            throw invalid("不支持的账本快照版本：支持网页版和原 App schema_version=2");
        // Check limits and secret fields before recursively transforming untrusted input.
        ObjectNode guard=((ObjectNode)input).deepCopy();guard.put("schemaVersion",2);guard.set("settings",JsonNodeFactory.instance.objectNode());
        SnapshotValidator.validate(guard);
        ObjectNode result=(ObjectNode)camel(input);
        result.put("schemaVersion",4);
        ArrayNode categories=JsonNodeFactory.instance.arrayNode();
        Set<String> categoryIds=new HashSet<>();
        flatten(input.path("categories"),null,categories,categoryIds,0);
        result.set("categories",categories);
        ArrayNode links=array(result,"transactionLedgerLinks");
        Map<String,ObjectNode> books=new LinkedHashMap<>();
        for(JsonNode node:array(result,"books")){
            ObjectNode book=object(node);String id=identifier(book.get("id"));book.put("id",id);
            if(books.put(id,book)!=null)throw invalid("账本 ID 重复");
            if(!book.hasNonNull("type"))book.put("type","general");
            textDefault(book,"note","");textDefault(book,"icon","book");textDefault(book,"color","#5b8def");
            nullable(book,"startDate","endDate","budgetStartDate","budgetEndDate","budgetLimitAmount");
            if(!book.has("isPinned"))book.put("isPinned",false);
            if(!book.has("autoCollectEnabled"))book.put("autoCollectEnabled",false);
            book.set("autoCollectCategoryIds",ids(book.get("autoCollectCategoryIds")));
            LinkedHashMap<String,ObjectNode> participants=new LinkedHashMap<>();
            for(JsonNode link:links)if(id.equals(link.path("ledgerId").asText()))for(JsonNode person:array(link,"participantSnapshot")){
                ObjectNode p=object(person).deepCopy();p.put("id",identifier(p.get("id")));participants.put(p.path("id").asText(),p);
            }
            for(JsonNode name:array(book,"participantNames")){
                boolean known=false;for(ObjectNode p:participants.values())if(p.path("name").asText().equals(name.asText()))known=true;
                if(!known){String pid="我".equals(name.asText())?"我":UUID.nameUUIDFromBytes((id+"|"+name.asText()).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
                    ObjectNode p=JsonNodeFactory.instance.objectNode();p.put("id",pid);p.put("name",name.asText());participants.put(pid,p);}
            }
            ArrayNode people=JsonNodeFactory.instance.arrayNode();participants.values().forEach(people::add);book.set("participants",people);
        }
        Map<String,ObjectNode> transactions=new LinkedHashMap<>();
        for(JsonNode node:array(result,"transactions")){
            ObjectNode tx=object(node);String id=identifier(tx.get("id"));tx.put("id",id);
            if(transactions.put(id,tx)!=null)throw invalid("流水 ID 重复");
            if(!tx.path("amount").isNumber()||tx.path("amount").decimalValue().signum()<0)throw invalid("流水金额格式无效");
            if(!Arrays.asList("expense","income").contains(tx.path("kind").asText()))throw invalid("流水收支类型无效");
            try{OffsetDateTime.parse(tx.path("happenedAt").asText());}catch(Exception e){throw invalid("流水日期必须包含时区");}
            if(!tx.path("title").isTextual())throw invalid("流水名称格式无效");
            textDefault(tx,"note","");textDefault(tx,"merchant","");textDefault(tx,"paymentMethod","");textDefault(tx,"source","manual");textDefault(tx,"currency","CNY");
            if(tx.hasNonNull("categoryId")){String cid=identifier(tx.get("categoryId"));if(!categoryIds.contains(cid))throw invalid("流水引用的分类不存在");tx.put("categoryId",cid);}else tx.putNull("categoryId");
            // An explicit empty book_ids means unassigned. Legacy book_id can be a stale/deleted ID.
            ArrayNode assigned=ids(tx.get("bookIds"));
            if(!tx.has("bookIds")&&tx.hasNonNull("bookId")&&books.containsKey(tx.path("bookId").asText()))assigned.add(tx.path("bookId").asText());
            for(JsonNode bid:assigned)if(!books.containsKey(bid.asText()))throw invalid("流水引用的账本不存在");
            tx.set("bookIds",assigned);tx.set("splitParticipantIds",ids(tx.get("splitParticipantIds")));
            nullable(tx,"paidByParticipantId","installmentGroupId","installmentIndex","installmentMonths","installmentOriginalTotal","installmentStartMonth","originalAmount","discountAmount","premiumAmount","splitRatio","splitAmount");
            if(tx.hasNonNull("paidByParticipantId"))tx.put("paidByParticipantId",tx.path("paidByParticipantId").asText());
            if(tx.hasNonNull("offsetSourceTransactionId"))tx.put("offsetSourceTransactionId",identifier(tx.get("offsetSourceTransactionId")));
            if(!tx.hasNonNull("splitMode"))tx.put("splitMode","equal");
            if(!tx.has("includeInStatistics"))tx.put("includeInStatistics",true);
            tx.set("ledgerSplitSettings",JsonNodeFactory.instance.objectNode());
        }
        for(JsonNode link:links){
            ObjectNode tx=transactions.get(link.path("transactionId").asText());String bid=link.path("ledgerId").asText();
            if(tx==null||!books.containsKey(bid))throw invalid("账本关联引用的流水或账本不存在");
            ArrayNode assigned=(ArrayNode)tx.get("bookIds");boolean found=false;for(JsonNode id:assigned)if(id.asText().equals(bid))found=true;if(!found)assigned.add(bid);
            ObjectNode settings=object(link).deepCopy();
            settings.set("splitParticipantIds",ids(link.get("splitParticipantIds")));
            JsonNode payer=link.get("payerParticipantId");settings.set("paidByParticipantId",payer==null||payer.isNull()?NullNode.instance:TextNode.valueOf(payer.asText()));
            textDefault(settings,"splitMode","equal");nullable(settings,"splitRatio","splitAmount");
            object(tx.get("ledgerSplitSettings")).set(bid,settings);
        }
        for(JsonNode node:array(result,"budgets")){
            ObjectNode budget=object(node);budget.put("id",identifier(budget.get("id")));
            textDefault(budget,"periodType","monthly");nullable(budget,"startDate","endDate","bookId");
            if(budget.hasNonNull("bookId"))budget.put("bookId",budget.path("bookId").asText());
            budget.set("categoryIds",ids(budget.get("categoryIds")));
            if(!budget.hasNonNull("month")){
                String start=budget.path("startDate").asText();
                if("monthly".equals(budget.path("periodType").asText())&&start.matches("\\d{4}-\\d{2}-.*"))budget.put("month",Integer.parseInt(start.substring(5,7)));
                else if("monthly".equals(budget.path("periodType").asText()))throw invalid("月度预算缺少月份");else budget.putNull("month");
            }
        }
        result.set("pinnedRanges",JsonNodeFactory.instance.arrayNode());
        ObjectNode settings=JsonNodeFactory.instance.objectNode();settings.put("appearanceMode","system");settings.putNull("backgroundDataUrl");
        LinkedHashSet<String> channels=new LinkedHashSet<>(Arrays.asList("微信","支付宝","银行卡","现金"));for(ObjectNode tx:transactions.values())if(!tx.path("paymentMethod").asText().trim().isEmpty())channels.add(tx.path("paymentMethod").asText());
        ArrayNode channelList=JsonNodeFactory.instance.arrayNode();channels.forEach(channelList::add);settings.set("paymentChannels",channelList);
        settings.put("bookAssignmentPromptEnabled",true);settings.put("cloudSyncEnabled",false);settings.put("cloudSyncSchedule","on_app_open");settings.put("midnightSyncEnabled",false);
        result.set("settings",settings);SnapshotValidator.validate(result);return result;
    }
    private static void flatten(JsonNode rows,String parent,ArrayNode output,Set<String> seen,int depth){
        if(depth>20||!rows.isArray())throw invalid("分类层级格式无效");
        for(JsonNode raw:rows){
            ObjectNode category=(ObjectNode)camel(object(raw));String id=identifier(category.get("id"));
            if(!seen.add(id)||seen.size()>5000)throw invalid("分类 ID 重复或数量超限");
            category.put("id",id);if(parent==null)category.putNull("parentId");else category.put("parentId",parent);
            if(!Arrays.asList("expense","income").contains(category.path("flowType").asText()))throw invalid("分类收支类型无效");
            textDefault(category,"icon","grid");textDefault(category,"color","#849184");if(!category.has("sortOrder"))category.put("sortOrder",output.size());
            category.remove("children");output.add(category);
            if(raw.has("children"))flatten(raw.get("children"),id,output,seen,depth+1);
        }
    }
    private static JsonNode camel(JsonNode value){
        if(value.isArray()){ArrayNode result=JsonNodeFactory.instance.arrayNode();for(JsonNode v:value)result.add(camel(v));return result;}
        if(!value.isObject())return value.deepCopy();
        ObjectNode result=JsonNodeFactory.instance.objectNode();value.fields().forEachRemaining(entry->{
            String[] parts=entry.getKey().split("_");StringBuilder name=new StringBuilder(parts[0]);for(int i=1;i<parts.length;i++)if(!parts[i].isEmpty())name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            if(result.has(name.toString()))throw invalid("快照包含重复命名字段");result.set(name.toString(),camel(entry.getValue()));
        });return result;
    }
    private static ObjectNode object(JsonNode node){if(node==null||!node.isObject())throw invalid("记录必须为 JSON 对象");return (ObjectNode)node;}
    private static ArrayNode array(JsonNode node,String name){JsonNode value=node.get(name);if(value==null||value.isNull())return JsonNodeFactory.instance.arrayNode();if(!value.isArray())throw invalid("数组格式无效: "+name);return (ArrayNode)value;}
    private static ArrayNode ids(JsonNode source){ArrayNode result=JsonNodeFactory.instance.arrayNode();if(source==null||source.isNull())return result;if(!source.isArray())throw invalid("关联 ID 必须为数组");for(JsonNode id:source)result.add(identifier(id));return result;}
    private static String identifier(JsonNode value){if(value==null||value.isNull()||!(value.isIntegralNumber()||value.isTextual())||value.asText().trim().isEmpty())throw invalid("记录 ID 格式无效");return value.asText();}
    private static void nullable(ObjectNode row,String...keys){for(String key:keys)if(!row.hasNonNull(key)||row.path(key).isTextual()&&row.path(key).asText().isEmpty())row.putNull(key);}
    private static void textDefault(ObjectNode row,String key,String fallback){if(!row.hasNonNull(key))row.put(key,fallback);}
    private static ResponseStatusException invalid(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
