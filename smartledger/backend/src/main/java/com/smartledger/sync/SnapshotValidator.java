package com.smartledger.sync;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class SnapshotValidator {
    private SnapshotValidator() { }
    static void validate(JsonNode snapshot){
        if(snapshot==null||!snapshot.isObject()||!snapshot.path("schemaVersion").isIntegralNumber()||snapshot.path("schemaVersion").asInt()<1||snapshot.path("schemaVersion").asInt()>4)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不支持的账本快照版本");
        requireArray(snapshot,"transactions",100000);requireArray(snapshot,"books",2000);requireArray(snapshot,"categories",5000);
        if(snapshot.has("budgets"))requireArray(snapshot,"budgets",2000);
        if(!snapshot.path("settings").isObject())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"账本设置格式无效");
        // Cloud backup must never contain login tokens or WebDAV credentials.
        rejectSecrets(snapshot,0);
    }
    private static void requireArray(JsonNode snapshot,String name,int maximum){
        JsonNode value=snapshot.path(name);
        if(!value.isArray()||value.size()>maximum)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"快照字段格式无效或数量超限: "+name);
    }
    private static void rejectSecrets(JsonNode node,int depth){
        if(depth>32)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"快照嵌套层级过深");
        if(node.isObject()){
            java.util.Iterator<String> names=node.fieldNames();while(names.hasNext()){
                String name=names.next(),key=name.toLowerCase(java.util.Locale.ROOT).replace("_","").replace("-","");
                if(key.equals("accesstoken")||key.equals("refreshtoken")||key.equals("apppassword")||key.equals("clientsecret"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"快照不得包含登录凭证或应用密码");
                rejectSecrets(node.get(name),depth+1);
            }
        }else if(node.isArray())for(JsonNode value:node)rejectSecrets(value,depth+1);
    }
}
