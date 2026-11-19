import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, formatTime } from './api';
import { Icon } from './icons';
import { SubmissionPanel } from './SubmissionPanel';
import type { EvaluationList, SearchResult } from './types';

export type InspectorTab = 'submit' | 'media' | 'all';

/** Seek bằng ms / 1000 sau loadedmetadata; hủy listener và request cũ khi đổi kết quả. */
export function Inspector({
  selected,
  evaluations,
  saved,
  feedback,
  imageAvailable,
  onClose,
  onSelect,
  onSave,
  onFeedback,
  onExample,
  onSubmitted,
  initialTaskKey,
  initialTaskType,
  initialEvaluationId,
  initialMode,
  onTaskKeyChange,
  onTaskTypeChange,
  onEvaluationIdChange,
  onModeChange,
}: {
  selected: SearchResult;
  evaluations: EvaluationList | null;
  saved: boolean;
  feedback?: boolean;
  imageAvailable: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  onSave: (result: SearchResult) => void;
  onFeedback: (result: SearchResult, relevant: boolean) => void;
  onExample: (result: SearchResult) => void;
  onSubmitted: () => void;
  initialTaskKey?: string;
  initialTaskType?: 'KIS' | 'QA';
  initialEvaluationId?: string;
  initialMode?: 'dry_run' | 'mock' | 'live';
  onTaskKeyChange?: (key: string) => void;
  onTaskTypeChange?: (type: 'KIS' | 'QA') => void;
  onEvaluationIdChange?: (id: string) => void;
  onModeChange?: (mode: 'dry_run' | 'mock' | 'live') => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [neighbors, setNeighbors] = useState<SearchResult[]>([]);
  const [neighborError, setNeighborError] = useState('');
  const [videoError, setVideoError] = useState('');
  const [neighborLoading, setNeighborLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>(() => {
    const savedTab = localStorage.getItem('cs336-inspector-tab');
    return (savedTab === 'submit' || savedTab === 'media' || savedTab === 'all') ? savedTab : 'submit';
  });
  const [showVideoInSubmit, setShowVideoInSubmit] = useState(false);

  const handleTabChange = (tab: InspectorTab) => {
    setActiveTab(tab);
    localStorage.setItem('cs336-inspector-tab', tab);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoError('');
    const seek = () => {
      try { video.currentTime = selected.timestamp_ms / 1000; }
      catch { setVideoError('Trình duyệt chưa thể seek video. Kiểm tra codec và byte ranges của nguồn.'); }
    };
    video.addEventListener('loadedmetadata', seek);
    if (video.readyState >= 1) seek();
    return () => video.removeEventListener('loadedmetadata', seek);
  }, [selected.video_url, selected.timestamp_ms, selected.keyframe_id]);

  useEffect(() => {
    const controller = new AbortController();
    setNeighbors([]); setNeighborError(''); setNeighborLoading(true);
    api<{ results: SearchResult[] }>(`/api/videos/${encodeURIComponent(selected.video_uid)}/neighbors?timestamp_ms=${selected.timestamp_ms}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setNeighbors(value.results); })
      .catch(reason => { if (!controller.signal.aborted) setNeighborError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setNeighborLoading(false); });
    return () => controller.abort();
  }, [selected.video_uid, selected.timestamp_ms]);

  const sorted = neighbors.filter(item => item.video_uid === selected.video_uid).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const previous = sorted.filter(item => item.timestamp_ms < selected.timestamp_ms).at(-1);
  const next = sorted.find(item => item.timestamp_ms > selected.timestamp_ms);

  return (
    <aside className="inspector panel" aria-label="Chi tiết keyframe">
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">KHUNG HÌNH ĐÃ CHỌN</span>
          <h2>{selected.media_item_name}</h2>
        </div>
        <button className="icon-button" aria-label="Đóng chi tiết" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      {/* Tabs điều hướng tách biệt phần Nộp bài DRES và phần Video & Chi tiết */}
      <div className="inspector-tabs" role="tablist" aria-label="Chế độ xem chi tiết">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'submit'}
          className={`inspector-tab ${activeTab === 'submit' ? 'active' : ''}`}
          onClick={() => handleTabChange('submit')}
          title="Chỉ hiển thị form nộp bài DRES — Không cần cuộn qua video"
        >
          <Icon name="send" size={13} />
          <span>Nộp bài DRES</span>
          {initialMode === 'live' && <span className="tab-pill live">LIVE</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'media'}
          className={`inspector-tab ${activeTab === 'media' ? 'active' : ''}`}
          onClick={() => handleTabChange('media')}
          title="Xem video gốc, filmstrip lân cận và đánh giá liên quan"
        >
          <Icon name="play" size={13} />
          <span>Video &amp; Chi tiết</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`inspector-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => handleTabChange('all')}
          title="Hiển thị cả video và form nộp bài trên cùng một thanh cuộn"
        >
          <Icon name="layers" size={13} />
          <span>Tất cả</span>
        </button>
      </div>

      {/* Compact Frame Header khi ở tab Nộp bài DRES */}
      {activeTab === 'submit' && (
        <div className="compact-frame-card">
          <img src={selected.thumbnail_url} alt="" className="compact-frame-thumb" />
          <div className="compact-frame-info">
            <div className="compact-frame-title">
              <strong>{selected.media_item_name}</strong>
              <code>{formatTime(selected.timestamp_ms)}</code>
            </div>
            <span className="compact-frame-ms">{selected.timestamp_ms} ms · PTS</span>
          </div>
          <div className="compact-frame-actions">
            <button
              type="button"
              className={`button text-button compact-btn ${showVideoInSubmit ? 'active-btn' : ''}`}
              onClick={() => setShowVideoInSubmit(prev => !prev)}
              title={showVideoInSubmit ? 'Thu gọn video player' : 'Mở xem nhanh video player'}
            >
              <Icon name="play" size={12} />
              <span>{showVideoInSubmit ? 'Ẩn video' : 'Xem video'}</span>
            </button>
            <button
              type="button"
              className="button text-button compact-btn"
              onClick={() => handleTabChange('media')}
              title="Chuyển sang xem đầy đủ video và keyframe lân cận"
            >
              <Icon name="chevron" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Video Player: luôn có trong DOM để giữ currentTime và listener, chỉ ẩn/hiện tùy tab */}
      <div
        className="inspector-video-wrap"
        style={{
          display: (activeTab === 'media' || activeTab === 'all' || (activeTab === 'submit' && showVideoInSubmit)) ? 'block' : 'none',
          marginBottom: '10px',
        }}
      >
        <video
          ref={videoRef}
          key={selected.video_url}
          src={selected.video_url}
          controls
          preload="metadata"
          poster={selected.thumbnail_url}
          onError={() => setVideoError('Không phát được video. Trình duyệt cần codec hỗ trợ; hãy kiểm tra nguồn media.')}
          aria-label={`Video ${selected.media_item_name}`}
        />
        {videoError && <p className="inline-error" role="alert">{videoError}</p>}
        {(activeTab === 'media' || activeTab === 'all') && (
          <div className="seek-bar">
            <code>{formatTime(selected.timestamp_ms)}</code>
            <span>{selected.timestamp_ms} ms</span>
          </div>
        )}
      </div>

      {/* Phần Chi tiết Media: Keyframe lân cận, Feedback, Lưu ứng viên, Evidence */}
      <div
        className="inspector-media-details"
        style={{ display: (activeTab === 'media' || activeTab === 'all') ? 'block' : 'none' }}
      >
        <div className="neighbor-toolbar">
          <button className="button text-button" disabled={!previous} onClick={() => previous && onSelect(previous)}>
            <Icon name="chevron" className="rotate" size={15} /> Trước
          </button>
          <span className="muted small">Keyframe lân cận</span>
          <button className="button text-button" disabled={!next} onClick={() => next && onSelect(next)}>
            Sau <Icon name="chevron" size={15} />
          </button>
        </div>
        {neighborLoading ? (
          <p className="small muted" role="status">Đang tải filmstrip…</p>
        ) : (
          <div className="filmstrip">
            {sorted.map(item => (
              <button
                key={item.keyframe_id}
                className={item.keyframe_id === selected.keyframe_id ? 'active' : ''}
                onClick={() => onSelect(item)}
                aria-label={`Xem ${formatTime(item.timestamp_ms)}`}
              >
                <img src={item.thumbnail_url} alt="" loading="lazy" />
                <small>{formatTime(item.timestamp_ms).slice(3)}</small>
              </button>
            ))}
          </div>
        )}
        {neighborError && <p className="small inline-error">{neighborError}</p>}
        {selected.pair && (
          <div className="pair-info">
            <Icon name="temporal" size={17} />
            <span>A → B: <strong>{formatTime(selected.pair.timestamp_ms)}</strong><small>Khoảng cách {selected.pair.gap_ms} ms</small></span>
            <button className="button text-button" onClick={() => onSelect({ ...selected, keyframe_id: selected.pair!.keyframe_id, timestamp_ms: selected.pair!.timestamp_ms, thumbnail_url: `/api/media/thumbnail/${encodeURIComponent(selected.pair!.keyframe_id)}`, pair: undefined })}>Xem B</button>
          </div>
        )}
        <div className="feedback-actions">
          <button className={`button secondary ${feedback === true ? 'selected-positive' : ''}`} onClick={() => onFeedback(selected, true)} aria-pressed={feedback === true}>
            <Icon name="check" size={17} /> Liên quan
          </button>
          <button className={`button secondary ${feedback === false ? 'selected-negative' : ''}`} onClick={() => onFeedback(selected, false)} aria-pressed={feedback === false}>
            <Icon name="close" size={17} /> Không liên quan
          </button>
        </div>
        <button className={`button secondary full ${saved ? 'saved' : ''}`} onClick={() => onSave(selected)}>
          <Icon name={saved ? 'check' : 'bookmark'} size={17} />{saved ? 'Đã lưu · bấm để bỏ lưu' : 'Lưu vào ứng viên'}
        </button>
        <button className="button text-button full" disabled={!imageAvailable} title={!imageAvailable ? 'Tìm bằng ảnh chưa có sẵn hoặc bị chặn bởi luật Video KIS.' : undefined} onClick={() => onExample(selected)}>
          <Icon name="image" size={17} /> Dùng khung hình này để tìm tiếp
        </button>
        <details className="evidence">
          <summary>Điểm xếp hạng & nguồn đóng góp</summary>
          <p className="small muted">{Object.keys(selected.contributions).length ? `Điểm ${Number(selected.score).toFixed(5)} là điểm xếp hạng, không phải xác suất đúng.` : 'Khung hình từ metadata. Không có điểm truy vấn cho lần chọn này.'}</p>
          <pre>{JSON.stringify(selected.contributions, null, 2)}</pre>
          {selected.text && <blockquote>{selected.text}</blockquote>}
          <small className="muted">Keyframe ID: {selected.keyframe_id}</small>
        </details>

        {activeTab === 'media' && (
          <button
            type="button"
            className="button primary full"
            style={{ marginTop: '16px', minHeight: '40px', fontWeight: 650 }}
            onClick={() => handleTabChange('submit')}
          >
            <Icon name="send" size={15} /> Sang phần nộp bài DRES →
          </button>
        )}
      </div>

      {/* Phần Nộp bài DRES */}
      <div
        className="inspector-submit-section"
        style={{ display: (activeTab === 'submit' || activeTab === 'all') ? 'block' : 'none' }}
      >
        <SubmissionPanel
          selected={selected}
          evaluations={evaluations}
          onSubmitted={onSubmitted}
          initialTaskKey={initialTaskKey}
          initialTaskType={initialTaskType}
          initialEvaluationId={initialEvaluationId}
          initialMode={initialMode}
          onTaskKeyChange={onTaskKeyChange}
          onTaskTypeChange={onTaskTypeChange}
          onEvaluationIdChange={onEvaluationIdChange}
          onModeChange={onModeChange}
        />
      </div>
    </aside>
  );
}
