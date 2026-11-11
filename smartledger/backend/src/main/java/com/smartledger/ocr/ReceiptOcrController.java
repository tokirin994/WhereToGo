package com.smartledger.ocr;

import com.smartledger.security.ApiErrors;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.Semaphore;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReceiptOcrController {
    private static final int MAX_IMAGE_BYTES = 4 * 1024 * 1024;
    private static final int MAX_RESULT_BYTES = 1024 * 1024;
    private final String workerUrl;
    private final Semaphore recognition = new Semaphore(1);

    public ReceiptOcrController(@Value("${SMARTLEDGER_OCR_URL:}") String workerUrl) {
        this.workerUrl = workerUrl.trim().replaceFirst("/$", "");
    }

    @GetMapping("/api/v1/ocr/status")
    public Map<String, Boolean> status() {
        return Collections.singletonMap("available", !workerUrl.isEmpty());
    }

    @PostMapping(value = "/api/v1/ocr/recognize", consumes = {"image/png", "image/jpeg", "image/webp"})
    public void recognize(HttpServletRequest request, HttpServletResponse response) throws IOException {
        if (workerUrl.isEmpty()) {
            unavailable(request, response);
            return;
        }
        if (request.getContentLengthLong() > MAX_IMAGE_BYTES) {
            ApiErrors.write(request, response, 413, "ocr_image_limit", "账单图片超过 4 MiB");
            return;
        }
        if (!recognition.tryAcquire()) {
            busy(request, response);
            return;
        }
        HttpURLConnection worker = null;
        try {
            byte[] image = readBounded(request.getInputStream(), MAX_IMAGE_BYTES);
            if (image == null) {
                ApiErrors.write(request, response, 413, "ocr_image_limit", "账单图片超过 4 MiB");
                return;
            }
            if (image.length == 0) {
                ApiErrors.write(request, response, 422, "ocr_invalid_image", "请选择一张账单图片");
                return;
            }
            worker = (HttpURLConnection) new URL(workerUrl + "/recognize").openConnection();
            worker.setConnectTimeout(2000);
            worker.setReadTimeout(25000);
            worker.setInstanceFollowRedirects(false);
            worker.setRequestMethod("POST");
            worker.setRequestProperty("Content-Type", request.getContentType());
            worker.setFixedLengthStreamingMode(image.length);
            worker.setDoOutput(true);
            try (OutputStream output = worker.getOutputStream()) {
                output.write(image);
            }
            int status = worker.getResponseCode();
            if (status == 200) {
                try (InputStream result = worker.getInputStream()) {
                    byte[] body = readBounded(result, MAX_RESULT_BYTES);
                    if (body == null) {
                        unavailable(request, response);
                        return;
                    }
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getOutputStream().write(body);
                }
            } else if (status == 429) {
                busy(request, response);
            } else if (status == 413) {
                ApiErrors.write(request, response, 413, "ocr_image_limit", "图片超过 800 万像素或 4 MiB");
            } else if (status == 422) {
                ApiErrors.write(request, response, 422, "ocr_invalid_image", "无法读取这张图片，请使用 PNG、JPEG 或 WebP");
            } else {
                unavailable(request, response);
            }
        } catch (IOException failure) {
            unavailable(request, response);
        } finally {
            if (worker != null) worker.disconnect();
            recognition.release();
        }
    }

    private static byte[] readBounded(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer, 0, Math.min(buffer.length, limit - output.size() + 1))) != -1) {
            if (count > limit - output.size()) return null;
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static void busy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setHeader("Retry-After", "3");
        ApiErrors.write(request, response, 429, "ocr_busy", "增强识别正在处理另一张图片，请稍后再试");
    }

    private static void unavailable(HttpServletRequest request, HttpServletResponse response) throws IOException {
        ApiErrors.write(request, response, 503, "ocr_unavailable", "增强识别暂不可用，可继续使用本机识别结果");
    }
}
