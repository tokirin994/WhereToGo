package com.smartledger.ocr;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.StreamUtils;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class ReceiptOcrControllerTest {
    @Test
    void forwardsImageBytesToTheWorker() throws Exception {
        byte[] image = {(byte) 0x89, 80, 78, 71, 0, (byte) 0xff};
        byte[] output = "{\"engine\":\"PP-OCRv6 Small\",\"rows\":[]}".getBytes(StandardCharsets.UTF_8);
        AtomicReference<byte[]> received = new AtomicReference<>();
        HttpServer worker = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        worker.createContext("/recognize", exchange -> {
            try {
                received.set(StreamUtils.copyToByteArray(exchange.getRequestBody()));
                exchange.sendResponseHeaders(200, output.length);
                exchange.getResponseBody().write(output);
            } finally {
                exchange.close();
            }
        });
        worker.start();
        try {
            ReceiptOcrController controller = new ReceiptOcrController("http://127.0.0.1:" + worker.getAddress().getPort());
            MockHttpServletResponse response = new MockHttpServletResponse();
            controller.recognize(request(image), response);
            assertEquals(200, response.getStatus());
            assertArrayEquals(image, received.get());
            assertArrayEquals(output, response.getContentAsByteArray());
        } finally {
            worker.stop(0);
        }
    }

    @Test
    void rejectsDisabledWorkerAndOversizedInputBeforeForwarding() throws Exception {
        ReceiptOcrController disabled = new ReceiptOcrController("");
        assertFalse(disabled.status().get("available"));
        MockHttpServletResponse unavailable = new MockHttpServletResponse();
        disabled.recognize(request(new byte[1]), unavailable);
        assertEquals(503, unavailable.getStatus());

        ReceiptOcrController configured = new ReceiptOcrController("http://127.0.0.1:1");
        MockHttpServletResponse oversized = new MockHttpServletResponse();
        configured.recognize(request(new byte[4 * 1024 * 1024 + 1]), oversized);
        assertEquals(413, oversized.getStatus());
    }

    private static MockHttpServletRequest request(byte[] image) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/ocr/recognize");
        request.setContentType("image/png");
        request.setContent(image);
        return request;
    }
}
