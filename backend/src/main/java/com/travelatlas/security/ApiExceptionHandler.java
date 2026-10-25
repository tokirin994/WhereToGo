package com.travelatlas.security;

import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import javax.validation.ConstraintViolationException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOG=LoggerFactory.getLogger(ApiExceptionHandler.class);
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,Object>> handle(Exception exception,HttpServletRequest request){
        int status=500;String code="internal_error",message="服务暂时不可用，请凭请求编号联系管理员";
        boolean guarded=false;
        Throwable cause=exception;for(int i=0;cause!=null&&i<32;i++,cause=cause.getCause()){
            if(cause instanceof ApiRequestFilter.LimitExceeded){status=413;code="payload_too_large";message="请求内容超过大小限制";guarded=true;break;}
            if(cause instanceof ApiRequestFilter.ComplexityExceeded){status=400;code="invalid_request";message="请求 JSON 复杂度超过限制";guarded=true;break;}
        }
        if(!guarded){
            if(exception instanceof ResponseStatusException){ResponseStatusException e=(ResponseStatusException)exception;status=e.getStatus().value();code="http_"+status;message=status<500&&e.getReason()!=null?e.getReason():message;}
            else if(exception instanceof MethodArgumentNotValidException||exception instanceof ConstraintViolationException||exception instanceof HttpMessageNotReadableException||exception instanceof org.springframework.web.method.annotation.MethodArgumentTypeMismatchException||exception instanceof org.springframework.web.bind.MissingServletRequestParameterException){status=400;code="invalid_request";message="请求参数或内容格式不正确";}
            else if(exception instanceof DataIntegrityViolationException){status=409;code="data_conflict";message="数据存在冲突，请刷新后重试";}
            else if(exception instanceof org.springframework.web.HttpRequestMethodNotSupportedException){status=405;code="method_not_allowed";message="此接口不支持该请求方法";}
            else if(exception instanceof org.springframework.web.HttpMediaTypeNotSupportedException){status=415;code="unsupported_media_type";message="此接口需要 application/json 请求内容";}
        }
        // Do not log request bodies, credentials, JWTs, SQL parameter values, or provider error bodies.
        if(status>=500)LOG.error("API failure requestId={} exceptionType={}",request.getAttribute("api.requestId"),exception.getClass().getSimpleName());
        return ResponseEntity.status(status).body(ApiErrors.body(request,status,code,message));
    }
}
