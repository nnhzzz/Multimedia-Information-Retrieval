import { useEffect, useMemo, useState } from 'react';
import { errorMessage, field, formatTime, post } from './api';
import { Icon } from './icons';
import type { DresStatus, EvaluationList, HistoryResponse, SearchResult, SubmissionRequest, SubmissionResponse, Video } from './types';

export type TaskTypeTab = 'TKIS' | 'VKIS' | 'QA' | 'QA_TEXT' | 'ITEM' | 'CUSTOM';

interface DresSubmissionHubProps {
  videos: Video[];
  evaluations: EvaluationList | null;
  dresStatus: DresStatus | null;
  history: HistoryResponse | null;
  selectedKeyframe: SearchResult | null;
  onOpenDresConfig: () => void;
  onSubmitted: () => void;
  initialTaskKey?: string;
  initialEvaluationId?: string;
  initialTaskType?: string;
  initialMode?: 'live' | 'dry_run';
  onTaskKeyChange?: (key: string) => void;
  onEvaluationIdChange?: (id: string) => void;
  onModeChange?: (mode: 'live' | 'dry_run') => void;
}

export function DresSubmissionHub({
  videos,
  evaluations,
  dresStatus,
  history,
  selectedKeyframe,
  onOpenDresConfig,
  onSubmitted,
  initialTaskKey = 'round-01',
  initialEvaluationId = '',
  initialTaskType = 'KIS',
  initialMode = 'live',
  onTaskKeyChange,
  onEvaluationIdChange,
  onModeChange,
}: DresSubmissionHubProps) {
  const [tab, setTab] = useState<TaskTypeTab>(() => (initialTaskType === 'QA' ? 'QA' : 'TKIS'));
  const [videoName, setVideoName] = useState(selectedKeyframe?.media_item_name || 'L22_V012');
  const [startMs, setStartMs] = useState<number>(selectedKeyframe?.timestamp_ms ?? 453000);
  const [endMs, setEndMs] = useState<number>(selectedKeyframe?.timestamp_ms ?? 453000);
  const [qaAnswer, setQaAnswer] = useState('3');
  const [qaRawText, setQaRawText] = useState('');
  const [taskKey, setTaskKey] = useState(() => initialTaskKey || localStorage.getItem('cs336-task-key') || 'round-01');
  const [evaluationId, setEvaluationId] = useState(() => initialEvaluationId || localStorage.getItem('cs336-eval-id') || '');
  const [mode, setMode] = useState<'live' | 'dry_run'>(() => {
    if (initialMode) return initialMode;
    const saved = localStorage.getItem('cs336-submit-mode');
    return saved === 'dry_run' ? 'dry_run' : 'live';
  });
  const [customPayloadText, setCustomPayloadText] = useState('{\n  "answerSets": [\n    {\n      "answers": [\n        {\n          "mediaItemName": "L22_V012",\n          "start": 453000,\n          "end": 453000\n        }\n      ]\n    }\n  ]\n}');

  const [previewTab, setPreviewTab] = useState<'json' | 'python'>('json');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResponse | null>(null);
  const [error, setError] = useState('');

  // Tự động chọn evaluation active nếu chưa chọn hoặc giữ evaluation đã lưu
  useEffect(() => {
    if (evaluations?.evaluations?.length) {
      const savedEvalId = localStorage.getItem('cs336-eval-id') || evaluationId;
      const exists = evaluations.evaluations.some(e => field(e, 'id', 'evaluation_id', 'evaluationId') === savedEvalId);
      if (exists && savedEvalId) {
        if (evaluationId !== savedEvalId) setEvaluationId(savedEvalId);
      } else {
        const activeEval = evaluations.evaluations.find(e => field(e, 'status', 'state').toUpperCase() === 'ACTIVE') || evaluations.evaluations[0];
        if (activeEval) {
          const autoId = field(activeEval, 'id', 'evaluation_id', 'evaluationId');
          setEvaluationId(autoId);
          localStorage.setItem('cs336-eval-id', autoId);
          onEvaluationIdChange?.(autoId);
        }
      }
    }
  }, [evaluations, evaluationId, onEvaluationIdChange]);

  const handleTaskKeyChange = (val: string) => {
    setTaskKey(val);
    localStorage.setItem('cs336-task-key', val);
    onTaskKeyChange?.(val);
  };

  const handleEvaluationIdChange = (val: string) => {
    setEvaluationId(val);
    localStorage.setItem('cs336-eval-id', val);
    onEvaluationIdChange?.(val);
  };

  const handleModeChange = (val: 'live' | 'dry_run') => {
    setMode(val);
    localStorage.setItem('cs336-submit-mode', val);
    onModeChange?.(val);
  };

  const handleTabChange = (newTab: TaskTypeTab) => {
    setTab(newTab);
    if (newTab === 'QA') {
      localStorage.setItem('cs336-task-type', 'QA');
    } else if (newTab === 'TKIS' || newTab === 'VKIS') {
      localStorage.setItem('cs336-task-type', 'KIS');
    }
  };

  // Sinh payload DRES theo dạng câu hỏi
  const currentPayload = useMemo(() => {
    const cleanVideo = videoName.replace(/\.mp4$/i, '').trim();
    if (tab === 'CUSTOM') {
      try {
        return JSON.parse(customPayloadText);
      } catch {
        return { error: 'JSON payload không hợp lệ' };
      }
    }
    if (tab === 'TKIS' || tab === 'VKIS') {
      return {
        answerSets: [
          {
            answers: [
              {
                mediaItemName: cleanVideo,
                start: Number(startMs),
                end: Number(endMs),
              },
            ],
          },
        ],
      };
    }
    if (tab === 'QA') {
      const formatted = `${qaAnswer.trim()}-${cleanVideo}-${startMs}`;
      return {
        answerSets: [
          {
            answers: [
              {
                text: formatted,
              },
            ],
          },
        ],
      };
    }
    if (tab === 'QA_TEXT') {
      return {
        answerSets: [
          {
            answers: [
              {
                text: qaRawText.trim(),
              },
            ],
          },
        ],
      };
    }
    if (tab === 'ITEM') {
      return {
        answerSets: [
          {
            answers: [
              {
                mediaItemName: cleanVideo,
              },
            ],
          },
        ],
      };
    }
    return {};
  }, [tab, videoName, startMs, endMs, qaAnswer, qaRawText, customPayloadText]);

  // Sinh mã Python tương ứng đúng theo script của người dùng
  const pythonScript = useMemo(() => {
    const baseUrl = dresStatus?.base_url || 'https://aiclub.uit.edu.vn/dres';
    const evalId = evaluationId || '<EVALUATION_ID>';
    const payloadStr = JSON.stringify(currentPayload, null, 4);

    return `import requests

BASE_URL = "${baseUrl}"
SESSION_ID = "${dresStatus?.session_preview ? '*** (Đã cấu hình trên Web)' : '<SESSION_ID>'}"
EVALUATION_ID = "${evalId}"

# Nộp bài dạng: ${tab === 'TKIS' ? 'Textual KIS (TKIS)' : tab === 'VKIS' ? 'Video KIS (VKIS)' : tab === 'QA' ? 'Q&A (AIC 2024 format: <Đáp án>-<Video>-<Mili-giây>)' : tab === 'QA_TEXT' ? 'Q&A (Chuỗi Text tự do)' : tab === 'ITEM' ? 'Video Item only' : 'Tùy chỉnh'}
url = f"{BASE_URL}/api/v2/submit/{EVALUATION_ID}"
params = {
    "session": SESSION_ID
}
payload = ${payloadStr}

res = requests.post(url, params=params, json=payload)

print("HTTP Status Code:", res.status_code)
print("Response:", res.text)
`;
  }, [dresStatus, evaluationId, currentPayload, tab]);

  function loadFromSelectedKeyframe() {
    if (!selectedKeyframe) return;
    setVideoName(selectedKeyframe.media_item_name);
    setStartMs(selectedKeyframe.timestamp_ms);
    setEndMs(selectedKeyframe.timestamp_ms);
  }

  function handleCopyPython() {
    navigator.clipboard.writeText(pythonScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  async function handleSubmit() {
    if (!evaluationId) {
      setError('Vui lòng chọn Evaluation ID trước khi nộp bài.');
      return;
    }
    const cleanVideo = videoName.replace(/\.mp4$/i, '').trim();
    if (!cleanVideo && tab !== 'QA_TEXT' && tab !== 'CUSTOM') {
      setError('Vui lòng nhập Video ID.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSubmissionResult(null);

    const submissionReq: SubmissionRequest = {
      evaluation_id: evaluationId,
      task_key: taskKey.trim() || 'round-01',
      mode,
      task_type: tab,
      ...(tab === 'CUSTOM'
        ? { custom_payload: currentPayload }
        : tab === 'QA_TEXT'
          ? { raw_text: qaRawText.trim() }
          : tab === 'QA'
            ? {
                media_item_name: cleanVideo,
                start_ms: Number(startMs),
                answer: qaAnswer.trim(),
              }
            : tab === 'ITEM'
              ? { media_item_name: cleanVideo }
              : {
                  media_item_name: cleanVideo,
                  start_ms: Number(startMs),
                  end_ms: Number(endMs),
                }),
    };

    try {
      const res = await post<SubmissionResponse>('/api/dres/submit', submissionReq);
      setSubmissionResult(res);
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dres-hub-container">
      {/* Banner đầu trang */}
      <div className="dres-hub-header">
        <div>
          <span className="eyebrow">DRES CONTEST SUBMISSION HUB</span>
          <h2>Trung tâm Nộp bài &amp; Chấm thi DRES</h2>
          <p className="muted">
            Tích hợp trực tiếp server chính thức <code>{dresStatus?.base_url || 'https://aiclub.uit.edu.vn/dres'}</code>.
            Hỗ trợ đầy đủ các dạng câu hỏi KIS, QA và đồng bộ trực tiếp với script Python.
          </p>
        </div>

        {/* Khối trạng thái server */}
        <div className="dres-server-card">
          <div className="dres-server-header">
            <span className={`status-dot ${dresStatus?.has_session && mode === 'live' ? 'ready' : ''}`} />
            <strong>{dresStatus?.base_url?.replace(/^https?:\/\//, '') || 'aiclub.uit.edu.vn'}</strong>
            <span className={`badge ${mode === 'live' ? 'coral' : ''}`}>
              {mode === 'live' ? 'LIVE THI ĐẤU' : 'DRY RUN AN TOÀN'}
            </span>
          </div>
          <div className="dres-server-body">
            <div className="server-metric">
              <small>Session Token:</small>
              <span>{dresStatus?.has_session ? `🟢 ${dresStatus.session_preview}` : '🔴 Chưa đăng nhập'}</span>
            </div>
            <div className="server-metric">
              <small>Chế độ:</small>
              <select
                value={mode}
                onChange={e => handleModeChange(e.target.value as 'live' | 'dry_run')}
                className="compact-select"
              >
                <option value="live">🔴 Live (Gửi lên DRES)</option>
                <option value="dry_run">🟠 Dry Run (Kiểm tra local)</option>
              </select>
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={onOpenDresConfig}
              style={{ marginTop: '6px' }}
            >
              <Icon name="settings" size={13} /> Cấu hình tài khoản / Đổi Session
            </button>
          </div>
        </div>
      </div>

      {/* Tabs chọn dạng câu hỏi */}
      <div className="task-type-nav" role="tablist">
        <button
          type="button"
          className={`task-type-btn ${tab === 'TKIS' ? 'active' : ''}`}
          onClick={() => { handleTabChange('TKIS'); setError(''); }}
        >
          <Icon name="text" size={16} />
          <div>
            <strong>Textual KIS (TKIS)</strong>
            <small>Tìm video qua văn bản</small>
          </div>
        </button>

        <button
          type="button"
          className={`task-type-btn ${tab === 'VKIS' ? 'active' : ''}`}
          onClick={() => { handleTabChange('VKIS'); setError(''); }}
        >
          <Icon name="play" size={16} />
          <div>
            <strong>Visual KIS (VKIS)</strong>
            <small>Tìm video qua clip mẫu</small>
          </div>
        </button>

        <button
          type="button"
          className={`task-type-btn ${tab === 'QA' ? 'active' : ''}`}
          onClick={() => { handleTabChange('QA'); setError(''); }}
        >
          <Icon name="zap" size={16} />
          <div>
            <strong>Q&amp;A (Chuẩn AIC 2024)</strong>
            <small>&lt;Đáp án&gt;-&lt;Video&gt;-&lt;Thời gian&gt;</small>
          </div>
        </button>

        <button
          type="button"
          className={`task-type-btn ${tab === 'QA_TEXT' ? 'active' : ''}`}
          onClick={() => { handleTabChange('QA_TEXT'); setError(''); }}
        >
          <Icon name="code" size={16} />
          <div>
            <strong>Q&amp;A (Văn bản tự do)</strong>
            <small>Chuỗi text đáp án</small>
          </div>
        </button>

        <button
          type="button"
          className={`task-type-btn ${tab === 'ITEM' ? 'active' : ''}`}
          onClick={() => { handleTabChange('ITEM'); setError(''); }}
        >
          <Icon name="folder" size={16} />
          <div>
            <strong>Video Item only</strong>
            <small>Chỉ nộp mediaItemName</small>
          </div>
        </button>

        <button
          type="button"
          className={`task-type-btn ${tab === 'CUSTOM' ? 'active' : ''}`}
          onClick={() => { handleTabChange('CUSTOM'); setError(''); }}
        >
          <Icon name="settings" size={16} />
          <div>
            <strong>Custom JSON</strong>
            <small>Tùy biến payload</small>
          </div>
        </button>
      </div>

      {/* Grid chính: Form nhập liệu bên trái + Live Preview & Python bên phải */}
      <div className="dres-hub-main-grid">
        {/* Cột trái: Form nhập liệu */}
        <div className="dres-hub-form panel">
          <div className="section-title">
            <h3><Icon name="send" size={18} /> Thông tin nộp bài ({tab})</h3>
            {selectedKeyframe && (
              <button
                type="button"
                className="button text-button"
                onClick={loadFromSelectedKeyframe}
                title={`Nạp ${selectedKeyframe.media_item_name} tại ${formatTime(selectedKeyframe.timestamp_ms)}`}
              >
                <Icon name="arrow" size={13} /> Lấy từ frame đang xem ({selectedKeyframe.media_item_name})
              </button>
            )}
          </div>

          {/* Chọn Phiên đánh giá (Evaluation ID) */}
          <div className="form-group">
            <label>
              <strong>Phiên đánh giá (Evaluation ID):</strong>
              <select
                value={evaluationId}
                onChange={e => handleEvaluationIdChange(e.target.value)}
                className="full-select"
              >
                <option value="">-- Chọn Evaluation Active trên DRES --</option>
                {evaluations?.evaluations?.map((ev, idx) => {
                  const id = field(ev, 'id', 'evaluation_id', 'evaluationId');
                  const name = field(ev, 'name', 'title', 'id');
                  const status = field(ev, 'status', 'state');
                  return (
                    <option key={idx} value={id}>
                      {name} · [{status}] (ID: {id.slice(0, 8)}...)
                    </option>
                  );
                })}
              </select>
            </label>
            <span className="input-hint">ID phiên thi đấu đang diễn ra trên DRES Server.</span>
          </div>

          {/* Task / Round key */}
          <div className="form-row">
            <label>
              Mã vòng thi (Task / Round Key):
              <input
                type="text"
                value={taskKey}
                onChange={e => handleTaskKeyChange(e.target.value)}
                placeholder="round-01, KIS-01, ..."
              />
            </label>
          </div>

          {tab === 'CUSTOM' ? (
            <div className="form-group">
              <label>
                <strong>Tùy biến Payload JSON (DRES v2 Schema):</strong>
                <textarea
                  value={customPayloadText}
                  onChange={e => setCustomPayloadText(e.target.value)}
                  rows={10}
                  className="code-textarea"
                />
              </label>
            </div>
          ) : tab === 'QA_TEXT' ? (
            <div className="form-group">
              <label>
                <strong>Nội dung câu trả lời (Text):</strong>
                <textarea
                  value={qaRawText}
                  onChange={e => setQaRawText(e.target.value)}
                  placeholder="Nhập nội dung đáp án văn bản hoặc đáp án trắc nghiệm..."
                  rows={4}
                />
              </label>
            </div>
          ) : (
            <>
              {/* Tên Video (mediaItemName) */}
              <div className="form-group">
                <label>
                  <strong>Tên video mục tiêu (Video ID / mediaItemName):</strong>
                  <div className="input-with-datalist">
                    <input
                      type="text"
                      list="video-datalist"
                      value={videoName}
                      onChange={e => setVideoName(e.target.value)}
                      placeholder="Ví dụ: L22_V012 (không kèm .mp4)"
                    />
                    <datalist id="video-datalist">
                      {videos.slice(0, 100).map(v => (
                        <option key={v.video_uid} value={v.media_item_name} />
                      ))}
                    </datalist>
                  </div>
                </label>
                <span className="input-hint">
                  Tên video trong kho dữ liệu (hệ thống tự động loại bỏ đuôi <code>.mp4</code> nếu có).
                </span>
              </div>

              {/* Dành cho KIS: Start ms và End ms */}
              {(tab === 'TKIS' || tab === 'VKIS') && (
                <div className="time-range-box">
                  <div className="form-row">
                    <label>
                      Mốc bắt đầu (Start ms):
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={startMs}
                        onChange={e => setStartMs(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Mốc kết thúc (End ms):
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={endMs}
                        onChange={e => setEndMs(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="time-helper-row">
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setEndMs(startMs)}
                      title="Nộp mốc thời gian duy nhất (start = end)"
                    >
                      ⚡ Đặt start = end ({startMs} ms)
                    </button>
                    <span className="time-convert-preview">
                      <Icon name="clock" size={13} /> Bắt đầu: <b>{formatTime(startMs)}</b> ({(startMs / 1000).toFixed(1)}s)
                      {startMs !== endMs && <> · Kết thúc: <b>{formatTime(endMs)}</b> ({(endMs / 1000).toFixed(1)}s)</>}
                    </span>
                  </div>
                </div>
              )}

              {/* Dành cho QA Chuẩn AIC */}
              {tab === 'QA' && (
                <div className="qa-input-box">
                  <div className="form-row">
                    <label>
                      Đáp án câu hỏi (Chữ hoặc số):
                      <input
                        type="text"
                        value={qaAnswer}
                        onChange={e => setQaAnswer(e.target.value)}
                        placeholder="Ví dụ: red car, A, 3, 007, ..."
                      />
                    </label>
                    <label>
                      Thời điểm xảy ra sự kiện (Timestamp ms):
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={startMs}
                        onChange={e => {
                          setStartMs(Number(e.target.value));
                          setEndMs(Number(e.target.value));
                        }}
                      />
                    </label>
                  </div>
                  <div className="qa-format-preview">
                    <small className="muted">Chuỗi đáp án được gửi lên DRES (format AIC):</small>
                    <code>{`${qaAnswer.trim() || '...'}-${videoName.replace(/\.mp4$/i, '') || 'VIDEO'}-${startMs}`}</code>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <div className="inline-error" role="alert">{error}</div>}

          {/* Nút Submit chính */}
          <div className="submit-action-row">
            <button
              type="button"
              className={`button primary full submit-main-btn ${mode === 'live' ? 'live-btn' : ''}`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              <Icon name="zap" size={18} />
              {submitting
                ? 'Đang gửi lên DRES...'
                : mode === 'live'
                  ? '⚡ NỘP BÀI THI LÊN DRES (LIVE)'
                  : '🔍 KIỂM TRA PAYLOAD (DRY RUN)'}
            </button>
          </div>

          {/* Hộp kết quả chấm thi */}
          {submissionResult && (
            <div className={`submission-verdict-card ${submissionResult.status}`}>
              <div className="verdict-header">
                <strong>
                  {submissionResult.status === 'correct'
                    ? '🟢 CHÍNH XÁC (CORRECT) - Ghi điểm thành công!'
                    : submissionResult.status === 'incorrect'
                      ? '🔴 CHƯA ĐÚNG (WRONG) - Đáp án không chính xác'
                      : submissionResult.status === 'dry_run'
                        ? '🟠 DRY RUN HỢP LỆ - Đã kiểm tra cấu trúc payload an toàn'
                        : submissionResult.status === 'accepted_pending'
                          ? '🟡 ĐÃ TIẾP NHẬN (PENDING) - DRES đang chấm điểm'
                          : `TRẠNG THÁI: ${submissionResult.status.toUpperCase()}`}
                </strong>
                <small>Attempt ID: {submissionResult.attempt_id}</small>
              </div>
              <div className="verdict-body">
                <pre>{JSON.stringify(submissionResult.response ?? submissionResult, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Live Preview JSON & Code Python */}
        <div className="dres-hub-preview panel">
          <div className="preview-tab-header">
            <div className="view-tabs">
              <button
                type="button"
                className={previewTab === 'json' ? 'active' : ''}
                onClick={() => setPreviewTab('json')}
              >
                <Icon name="code" size={15} /> JSON Payload (DRES v2)
              </button>
              <button
                type="button"
                className={previewTab === 'python' ? 'active' : ''}
                onClick={() => setPreviewTab('python')}
              >
                <Icon name="send" size={15} /> Code Python tương ứng (requests)
              </button>
            </div>
            {previewTab === 'python' && (
              <button
                type="button"
                className="button text-button small"
                onClick={handleCopyPython}
              >
                <Icon name={copied ? 'check' : 'copy'} size={14} />
                {copied ? 'Đã sao chép!' : 'Sao chép Python'}
              </button>
            )}
          </div>

          <div className="preview-content">
            {previewTab === 'json' ? (
              <div className="payload-code-block">
                <div className="code-block-meta">
                  <span>POST <code>{dresStatus?.base_url || 'https://aiclub.uit.edu.vn/dres'}/api/v2/submit/{evaluationId || '{evaluationId}'}</code></span>
                  <span>?session=<code>{dresStatus?.session_preview || '...'}</code></span>
                </div>
                <pre><code>{JSON.stringify(currentPayload, null, 2)}</code></pre>
              </div>
            ) : (
              <div className="python-code-block">
                <pre><code>{pythonScript}</code></pre>
              </div>
            )}
          </div>

          <div className="dres-hub-tips">
            <Icon name="info" size={15} />
            <div>
              <strong>Lưu ý quan trọng từ BTC AI Challenge:</strong>
              <ul>
                <li>Thời gian nộp bài tính bằng <b>mili-giây (ms)</b>, là mốc thời gian xuất hiện trong video gốc.</li>
                <li>Tên file video (<code>mediaItemName</code>) không có đuôi <code>.mp4</code> (ví dụ: <code>L22_V012</code>).</li>
                <li>Mỗi lần trả lời sai bị trừ 10 điểm chính xác, hãy kiểm tra kỹ trước khi bấm nộp live.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Lịch sử các lần nộp gần đây */}
      {history?.submissions && history.submissions.length > 0 && (
        <div className="dres-history-section panel">
          <div className="section-title">
            <h3><Icon name="history" size={18} /> Lịch sử nộp bài gần nhất ({history.submissions.length} lần)</h3>
          </div>
          <div className="submission-history-table-wrap">
            <table className="submission-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Chế độ</th>
                  <th>Task Key</th>
                  <th>Trạng thái</th>
                  <th>Chi tiết Payload</th>
                </tr>
              </thead>
              <tbody>
                {history.submissions.slice(0, 10).map((sub, idx) => (
                  <tr key={idx}>
                    <td><small>{sub.created_at ? new Date(Number(sub.created_at)).toLocaleTimeString('vi-VN') : '—'}</small></td>
                    <td><span className={`badge ${sub.mode === 'live' ? 'coral' : ''}`}>{String(sub.mode).toUpperCase()}</span></td>
                    <td><code>{String(sub.task_key || '—')}</code></td>
                    <td>
                      <span className={`status-pill ${String(sub.status)}`}>
                        {String(sub.status)}
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary className="small">Xem payload</summary>
                        <pre className="small-pre">{JSON.stringify(sub.payload, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
