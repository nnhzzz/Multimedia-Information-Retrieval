#!/usr/bin/env python3
"""Script trích xuất và lập index toàn bộ video trong batch2.zip trên macOS Apple Silicon (MPS)."""

import os
import sys
import time
import zipfile
from pathlib import Path

# Đảm bảo import được module app
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Sử dụng GPU MPS của Apple Silicon nếu có
if "CS336_DEVICE" not in os.environ:
    os.environ["CS336_DEVICE"] = "mps"

from app.config import Settings
from app.db import Database
from app.pipeline import extract_video, embed_dataset, build_index


def main():
    settings = Settings.from_env()
    settings.ensure_directories()
    db = Database(settings.db_path)

    zip_path = settings.data_root / "inputs" / "batch2.zip"
    if not zip_path.is_file():
        print(f"[LỖI] Không tìm thấy file {zip_path}")
        sys.exit(1)

    dest_dir = settings.data_root / "videos" / "batch2"
    dest_dir.mkdir(parents=True, exist_ok=True)

    print("==================================================================")
    print(" BẮT ĐẦU QUÁ TRÌNH NẠP DỮ LIỆU BATCH 2")
    print(f" - Thiết bị tính toán (Device): {settings.device}")
    print(f" - Thư mục lưu trữ video: {dest_dir}")
    print(f" - Cơ sở dữ liệu: {settings.db_path}")
    print("==================================================================")

    # 1. Giải nén tất cả video từ zip
    print("\n[BƯỚC 1/3] Đang giải nén các video từ batch2.zip...")
    start_unzip = time.time()
    extracted_count = 0
    skipped_count = 0

    with zipfile.ZipFile(zip_path, allowZip64=True) as archive:
        entries = [e for e in archive.infolist() if e.filename.lower().endswith(".mp4")]
        total_entries = len(entries)
        print(f"--> Tìm thấy {total_entries} video .mp4 trong file nén.")

        for idx, entry in enumerate(entries, 1):
            filename = Path(entry.filename).name
            target_path = dest_dir / filename
            if target_path.exists() and target_path.stat().st_size == entry.file_size:
                skipped_count += 1
                continue

            with archive.open(entry) as src, open(target_path, "wb") as dst:
                while True:
                    chunk = src.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
            extracted_count += 1

            if idx % 50 == 0 or idx == total_entries:
                elapsed = time.time() - start_unzip
                print(f"    Đã xử lý {idx}/{total_entries} video ({extracted_count} mới, {skipped_count} đã có) - {elapsed:.1f}s")

    print(f"--> Hoàn tất giải nén trong {time.time() - start_unzip:.1f}s. (Giải nén mới: {extracted_count}, Đã có: {skipped_count})")

    # 2. Trích xuất frame (PTS sampling & thumbnail)
    video_files = sorted(list(dest_dir.glob("*.mp4")), key=lambda p: p.name)
    total_videos = len(video_files)
    print(f"\n[BƯỚC 2/3] Đang trích xuất keyframes (PTS 2000ms) cho {total_videos} video...")
    start_extract = time.time()
    total_frames = 0

    for idx, video_path in enumerate(video_files, 1):
        v_start = time.time()
        res = extract_video(
            db=db,
            settings=settings,
            path=video_path,
            source_batch="batch2",
            interval_ms=2000,
            max_frames=None,
        )
        total_frames += res.get("frame_count", 0)
        v_elapsed = time.time() - v_start

        if idx % 20 == 0 or idx == total_videos:
            overall_elapsed = time.time() - start_extract
            avg_per_video = overall_elapsed / idx
            remaining_secs = avg_per_video * (total_videos - idx)
            print(f"    [{idx}/{total_videos}] {video_path.name}: {res.get('frame_count')} frames (xong sau {v_elapsed:.2f}s) | Tổng frames: {total_frames} | Dự kiến còn: {remaining_secs/60:.1f} phút")

    print(f"--> Hoàn tất trích xuất {total_frames} keyframes trong {time.time() - start_extract:.1f}s.")

    # 3. Tạo vector embedding với OpenCLIP trên Apple Silicon MPS & Lập Index
    print("\n[BƯỚC 3/3] Đang mã hóa vector (OpenCLIP ViT-B-32 trên Apple Silicon MPS) & Lập chỉ mục Index...")
    start_embed = time.time()
    embeddings = embed_dataset(db, settings, batch_size=64, allow_download=False)
    print(f"--> Đã mã hóa {embeddings.get('row_count')} vector trong {time.time() - start_embed:.1f}s.")

    print("\n--> Đang xây dựng chỉ mục (Publish CURRENT Index)...")
    start_index = time.time()
    index_res = build_index(db, settings, shard_size=1000)
    print(f"--> Index v{index_res.get('version')} hoàn tất trong {time.time() - start_index:.1f}s. Số vector: {index_res.get('row_count')}.")

    print("\n==================================================================")
    print(" THÀNH CÔNG! HỆ THỐNG ĐÃ SẴN SÀNG TRUY VẤN TOÀN BỘ BATCH 2")
    print(f" - Tổng số video: {total_videos}")
    print(f" - Tổng số keyframes: {index_res.get('row_count')}")
    print(f" - Phiên bản Index: {index_res.get('version')}")
    print(" Bạn có thể khởi động giao diện bằng lệnh: ./scripts/start.sh")
    print("==================================================================")


if __name__ == "__main__":
    main()
