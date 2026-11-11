import io
import json
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from rapidocr import RapidOCR

MAX_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 8_000_000
MAX_SIDE = 1600
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
cv2.setNumThreads(1)
ENGINE = RapidOCR(params={
    "Global.log_level": "warning",
    "Global.max_side_len": MAX_SIDE,
    "Det.limit_side_len": 1280,
    "Det.limit_type": "max",
    "Rec.rec_batch_num": 1,
    "EngineConfig.onnxruntime.intra_op_num_threads": 1,
    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
})
ACTIVE = threading.Lock()
INFERENCE = ThreadPoolExecutor(max_workers=1)


def recognize(data):
    with Image.open(io.BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as original:
        if original.width * original.height > MAX_PIXELS:
            raise Image.DecompressionBombError("too many pixels")
        image = ImageOps.exif_transpose(original)
        width, height = image.size
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        scale_x, scale_y = width / image.width, height / image.height
        if "A" in image.getbands() or "transparency" in image.info:
            rgba = image.convert("RGBA")
            image = Image.alpha_composite(Image.new("RGBA", rgba.size, "white"), rgba)
        pixels = np.asarray(image.convert("RGB"))
    result = ENGINE(cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR))
    rows = []
    if result.txts is not None:
        for text, box in zip(result.txts, result.boxes, strict=True):
            x0, y0 = box.min(axis=0)
            x1, y1 = box.max(axis=0)
            rows.append({"text": text, "bbox": {
                "x0": float(x0) * scale_x, "y0": float(y0) * scale_y,
                "x1": float(x1) * scale_x, "y1": float(y1) * scale_y,
            }})
    return {"engine": "PP-OCRv6 Small", "width": width, "height": height, "rows": rows}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_args):
        pass

    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (ConnectionError, socket.timeout):
            pass

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"status": "up"})
        else:
            self.reply(404, {})

    def do_POST(self):
        if self.path != "/recognize":
            self.reply(404, {})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BYTES:
            self.reply(413, {})
            return
        if not ACTIVE.acquire(blocking=False):
            self.reply(429, {})
            return
        try:
            data = self.rfile.read(length)
            if len(data) != length:
                self.reply(400, {})
                return
            self.reply(200, INFERENCE.submit(recognize, data).result())
        except Image.DecompressionBombError:
            self.reply(413, {})
        except (UnidentifiedImageError, OSError, ValueError):
            self.reply(422, {})
        except Exception:
            self.reply(503, {})
        finally:
            ACTIVE.release()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
