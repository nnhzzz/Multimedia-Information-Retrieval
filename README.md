# CS336 · Hệ thống Truy vấn Sự kiện Video (Multimedia Information Retrieval)

Hệ thống truy vấn sự kiện video đa phương thức phục vụ môn học **CS336 — Multimedia Information Retrieval**, Đại học Công nghệ Thông tin (UIT).

Hệ thống kết hợp **FastAPI** (Python 3.13) ở backend, **React 19 + TypeScript** ở frontend, lưu trữ metadata và chỉ mục full-text với **SQLite FTS5**, cùng vector index **NumPy** được tối ưu hóa tăng tốc phần cứng (Apple Silicon MPS trên macOS, CUDA trên Linux/Windows, hoặc fallback CPU).

---

## 1. Tính năng nổi bật

- **Truy vấn đa phương thức (Multimodal Retrieval):**
  - **Visual-Text Search:** Tìm kiếm frame video theo mô tả văn bản bằng mô hình **OpenCLIP ViT-B-32** (vector 512 chiều, chuẩn hóa $L_2$).
  - **Image-to-Video Search:** Tìm kiếm frame tương đồng từ ảnh truy vấn.
  - **Kênh văn bản (OCR & ASR):** Trích xuất chữ trên màn hình bằng **Tesseract OCR** (`vie+eng`) và giọng nói bằng **Faster-Whisper** (`tiny`/`small`). Xếp hạng qua SQLite FTS5 / BM25 hỗ trợ chuẩn hóa tiếng Việt Unicode NFC.
  - **Dung hợp đa kênh (Hybrid Fusion):** Kết hợp kết quả từ các kênh thị giác và văn bản bằng thuật toán **Weighted RRF** (Reciprocal Rank Fusion).
  - **Truy vấn chuỗi thời gian (Temporal Retrieval):** Ghép cặp chuỗi sự kiện theo dòng thời gian video ($A \rightarrow B$).
  - **Phản hồi độ liên quan (Relevance Feedback):** Thuật toán **Rocchio** tự động cập nhật vector truy vấn dựa trên feedback của người dùng.
- **Player & Tìm kiếm chính xác theo PTS:**
  - Khung hình trích xuất gắn liền với Presentation Timestamp (PTS) tính theo mili-giây (`timestamp_ms`), đảm bảo seek chính xác đến thời điểm diễn ra sự kiện.
- **Tích hợp DRES Adapter:**
  - Kết nối và nộp kết quả theo thể thức đánh giá DRES (mặc định ở chế độ Dry-run an toàn).
- **Hỗ trợ đa nền tảng:** Chạy trơn tru trên cả macOS (Apple Silicon M-series), Linux và Windows.

---

## 2. Hướng dẫn cài đặt & Khởi động

### Trên macOS / Linux

1. **Cài đặt môi trường & build frontend:**
   ```bash
   ./scripts/setup.sh
   ```
   Script sẽ tự động khởi tạo `.venv`, cài đặt các dependency trong `requirements-lock.txt`, và build giao diện React.

2. **Khởi động hệ thống:**
   ```bash
   ./scripts/start.sh
   ```
   Ứng dụng sẽ chạy tại địa chỉ: **`http://127.0.0.1:8000`**

3. **Dừng hệ thống:**
   ```bash
   ./scripts/stop.sh
   ```

---

### Trên Windows

1. **Cài đặt môi trường:**
   ```powershell
   .\scripts\setup.ps1
   ```

2. **Khởi động server:**
   ```powershell
   .\scripts\start.ps1
   ```
   Mở trình duyệt tại **`http://127.0.0.1:8000`**

3. **Dừng server:**
   ```powershell
   .\scripts\stop.ps1
   ```

---

## 3. Quản lý Dữ liệu & Lập chỉ mục (Pipeline)

Hệ thống cung cấp CLI đầy đủ qua module `app.cli` và các script tự động hóa:

### Kiểm tra môi trường (Doctor)
```bash
.venv/bin/python -m app.cli doctor
```

### Nạp và lập chỉ mục tự động cho Batch 2
Script tự động giải nén video từ `data/inputs/batch2.zip`, trích xuất keyframe theo PTS (mỗi 2000ms), tạo embedding OpenCLIP và xuất bản chỉ mục:
```bash
.venv/bin/python scripts/ingest_batch2.py
```

### Sử dụng CLI thủ công
```bash
# Kiểm kê dữ liệu video/zip
.venv/bin/python -m app.cli inspect-data data/inputs/batch2.zip

# Trích xuất và lập index cho 1 video cụ thể
.venv/bin/python -m app.cli ingest "path/to/video.mp4" --batch batch2 --interval-ms 2000 --download-weights
```

---

## 4. Kiểm thử & Đảm bảo chất lượng (QA)

Hệ thống được kiểm thử toàn diện cả backend và frontend:

```bash
# 1. Chạy toàn bộ 86 bài test backend
.venv/bin/python -m pytest -q

# 2. Kiểm tra định dạng code với Ruff
.venv/bin/python -m ruff check app tests scripts/smoke_real.py scripts/ingest_batch2.py

# 3. Kiểm tra TypeScript, Lint và Test frontend
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
cd ..
```

---

## 5. API Endpoints chính

| Endpoint | Phương thức | Mô tả |
| :--- | :--- | :--- |
| `/api/capabilities` | `GET` | Kiểm tra trạng thái các kênh tìm kiếm (visual, ocr, asr, temporal,...) |
| `/api/search` | `POST` | Thực hiện truy vấn tìm kiếm đa phương thức |
| `/api/thumbnails/{id}` | `GET` | Tải ảnh thumbnail của keyframe |
| `/api/videos/{uid}` | `GET` | Stream video phục vụ trình phát tại mốc thời gian |
| `/api/submit` | `POST` | Gửi kết quả ứng viên lên hệ thống đánh giá DRES |
| `/api/feedback` | `POST` | Phản hồi độ liên quan (Rocchio Feedback) |

---

## 6. Giấy phép & Tài liệu tham khảo

- Đồ án được xây dựng phục vụ nghiên cứu và học tập môn CS336 tại UIT.
- Tài liệu kiến trúc và hướng dẫn chuyên sâu có thể tham khảo thêm tại thư mục `docs/`.
