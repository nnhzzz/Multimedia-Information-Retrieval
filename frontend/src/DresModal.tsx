import { useEffect, useState } from 'react';
import { api, errorMessage, post } from './api';
import { Icon } from './icons';
import type { DresStatus, EvaluationList } from './types';

interface DresModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: DresStatus | null;
  onUpdated: () => void;
}

export function DresModal({ isOpen, onClose, status, onUpdated }: DresModalProps) {
  const [baseUrl, setBaseUrl] = useState('https://aiclub.uit.edu.vn/dres');
  const [mode, setMode] = useState<'live' | 'dry_run'>('live');
  const [tab, setTab] = useState<'login' | 'token'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [evalList, setEvalList] = useState<EvaluationList | null>(null);

  useEffect(() => {
    if (status) {
      if (status.base_url) setBaseUrl(status.base_url);
      setMode(status.mode);
      if (status.username) setUsername(status.username);
    }
  }, [status]);

  if (!isOpen) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      // 1. Cập nhật server url trước nếu khác
      await post('/api/dres/config', { base_url: baseUrl.trim(), dry_run: false });
      // 2. Đăng nhập lấy sessionId
      const res = await post<{ session_id: string; username: string }>('/api/dres/login', { username, password });
      setMessage({ text: `Đăng nhập thành công! Session ID: ${res.session_id.slice(0, 8)}... (Chế độ LIVE đã bật)`, type: 'success' });
      onUpdated();
      // 3. Tải danh sách evaluations
      fetchEvaluations();
    } catch (err) {
      setMessage({ text: errorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await post('/api/dres/config', {
        base_url: baseUrl.trim(),
        session_id: sessionId.trim(),
        dry_run: mode === 'dry_run',
      });
      setMessage({ text: 'Đã lưu cấu hình DRES thành công!', type: 'success' });
      onUpdated();
      fetchEvaluations();
    } catch (err) {
      setMessage({ text: errorMessage(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchEvaluations() {
    try {
      const res = await api<EvaluationList>('/api/dres/evaluations');
      setEvalList(res);
    } catch {
      // Bỏ qua lỗi hiển thị phụ
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Icon name="settings" size={20} />
            <h3>Cấu hình Hệ thống Nộp bài DRES (AI Club UIT)</h3>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Đóng"><Icon name="close" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="dres-server-notice">
            <Icon name="info" size={16} />
            <span>Địa chỉ server chính thức được cấu hình: <code>https://aiclub.uit.edu.vn/dres</code></span>
          </div>

          {status?.mode === 'live' && !status?.has_session && (
            <div className="dres-alert error" style={{ margin: '10px 0 14px' }}>
              <Icon name="info" size={16} />
              <span>Phiên làm việc DRES trước đó đã hết hạn hoặc chưa đăng nhập. Vui lòng nhập mật khẩu tài khoản để đăng nhập lại.</span>
            </div>
          )}

          <div className="form-row">
            <label>
              Địa chỉ DRES Server
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://aiclub.uit.edu.vn/dres"
              />
            </label>
            <label>
              Chế độ nộp bài
              <select value={mode} onChange={e => setMode(e.target.value as 'live' | 'dry_run')}>
                <option value="live">🔴 Live (Nộp bài thi thật)</option>
                <option value="dry_run">🟠 Dry Run (Kiểm tra an toàn local)</option>
              </select>
            </label>
          </div>

          <div className="dres-auth-tabs">
            <button
              type="button"
              className={tab === 'login' ? 'active' : ''}
              onClick={() => { setTab('login'); setMessage(null); }}
            >
              Cách 1: Đăng nhập (Username/Password)
            </button>
            <button
              type="button"
              className={tab === 'token' ? 'active' : ''}
              onClick={() => { setTab('token'); setMessage(null); }}
            >
              Cách 2: Nhập trực tiếp Session ID
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="dres-auth-form">
              <div className="form-row">
                <label>
                  Tên tài khoản đội thi (Username)
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Ví dụ: Team_07"
                    required
                  />
                </label>
                <label>
                  Mật khẩu (Password)
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mật khẩu do BTC/thầy cấp"
                    required
                  />
                </label>
              </div>
              <button className="button primary full" type="submit" disabled={loading || !username || !password}>
                <Icon name="send" size={16} />
                {loading ? 'Đang xác thực...' : 'Đăng nhập DRES & Kích hoạt Live'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSaveToken} className="dres-auth-form">
              <label>
                Session ID (Token định danh)
                <input
                  type="text"
                  value={sessionId}
                  onChange={e => setSessionId(e.target.value)}
                  placeholder="Dán mã sessionId lấy từ https://aiclub.uit.edu.vn/dres/user"
                  required
                />
              </label>
              <p className="small muted">
                Mẹo: Nếu đã đăng nhập trên trình duyệt tại <a href="https://aiclub.uit.edu.vn/dres/user" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>https://aiclub.uit.edu.vn/dres/user</a>, chỉ cần copy Session ID và dán vào đây.
              </p>
              <button className="button primary full" type="submit" disabled={loading || !sessionId.trim()}>
                <Icon name="check" size={16} />
                {loading ? 'Đang lưu...' : 'Lưu Session ID & Cập nhật'}
              </button>
            </form>
          )}

          {message && (
            <div className={`dres-alert ${message.type === 'success' ? 'success' : 'error'}`}>
              <Icon name={message.type === 'success' ? 'check' : 'info'} size={16} />
              <span>{message.text}</span>
            </div>
          )}

          <div className="dres-status-box">
            <div className="status-item">
              <span className="muted">Trạng thái phiên:</span>
              <strong>{status?.has_session ? <span className="text-success">🟢 Đã có Session ({status.session_preview})</span> : <span className="text-warning">Chưa có Session (Cần đăng nhập)</span>}</strong>
            </div>
            <div className="status-item">
              <span className="muted">Chế độ hiện tại:</span>
              <strong className={status?.mode === 'live' ? 'text-coral' : ''}>{status?.mode === 'live' ? 'LIVE (THI THẬT)' : 'DRY RUN'}</strong>
            </div>
            <button
              type="button"
              className="button text-button"
              onClick={fetchEvaluations}
              style={{ marginTop: 6 }}
            >
              <Icon name="refresh" size={13} /> Kiểm tra các phiên đánh giá (Evaluations)
            </button>
            {evalList && (
              <div className="eval-mini-list">
                <small className="muted">Danh sách Evaluations tìm thấy ({evalList.evaluations.length}):</small>
                <ul>
                  {evalList.evaluations.map((ev, idx) => (
                    <li key={idx}>
                      <code>{String(ev.name || ev.id)}</code> ({String(ev.status)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="button secondary" type="button" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
