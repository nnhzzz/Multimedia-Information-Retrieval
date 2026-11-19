import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { Inspector } from './Inspector';
import { SubmissionPanel } from './SubmissionPanel';
import { DresSubmissionHub } from './DresSubmissionHub';
import type { SearchResult } from './types';

const fixtureResult: SearchResult = { keyframe_id: 'fixture-k1', video_uid: 'fixture-v1', media_item_name: 'FIXTURE_VIDEO', timestamp_ms: 12340, thumbnail_url: '/fixture.jpg', video_url: '/fixture.mp4', score: .42, contributions: { visual: { rank: 1 } } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('DRES deliberate submission', () => {
  it('requires current preview and preserves QA leading zeroes in both requests', async () => {
    const fetchMock = vi.fn(async (url: string) => json(url.endsWith('/preview') ? { payload: { answerSets: [{ answers: [{ text: '007-FIXTURE_VIDEO-12340' }] }] }, mode: 'mock', profile: 'aic2024_v2' } : { attempt_id: 'fixture-attempt', status: 'correct', payload: {} }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SubmissionPanel selected={fixtureResult} evaluations={{ evaluations: [{ id: 'mock-evaluation', name: 'Fixture mock', status: 'ACTIVE', mock: true }], mode: 'mock', profile: 'aic2024_v2' }} onSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Loại đáp án'), { target: { value: 'QA' } });
    fireEvent.change(screen.getByLabelText('Chế độ'), { target: { value: 'mock' } });
    fireEvent.change(screen.getByLabelText('Evaluation'), { target: { value: 'mock-evaluation' } });
    fireEvent.change(screen.getByLabelText('Task / round key'), { target: { value: 'fixture-task' } });
    fireEvent.change(screen.getByLabelText(/Đáp án QA/), { target: { value: '007' } });
    expect(screen.getByRole('button', { name: 'Nộp vào mock' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước JSON' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nộp vào mock' })).toBeEnabled());
    expect(screen.getByText(/007-FIXTURE_VIDEO-12340/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nộp vào mock' }));
    await screen.findByText('Đúng theo ground truth mock');
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(JSON.parse(String(call[1].body)).answer).toBe('007');
      expect(JSON.parse(String(call[1].body)).timestamp_ms).toBe(12340);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('invalidates preview after the task changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ payload: {}, mode: 'dry_run', profile: 'aic2024_v2' })));
    render(<SubmissionPanel selected={fixtureResult} evaluations={{ evaluations: [{ id: 'fixture-eval', name: 'Fixture', status: 'ACTIVE' }], mode: 'dry_run', profile: 'aic2024_v2' }} onSubmitted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Evaluation'), { target: { value: 'fixture-eval' } });
    fireEvent.change(screen.getByLabelText('Task / round key'), { target: { value: 'task-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước JSON' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ghi nhận dry run' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Task / round key'), { target: { value: 'task-2' } });
    expect(screen.getByRole('button', { name: 'Ghi nhận dry run' })).toBeDisabled();
  });

  it('persists task type, mode, evaluation, and task key across unmounts/reselections', () => {
    const onKey = vi.fn();
    const onType = vi.fn();
    const onEval = vi.fn();
    const onMode = vi.fn();

    const evals = { evaluations: [{ id: 'live-eval-1', name: 'Đề thi 1', status: 'ACTIVE' }, { id: 'local-mock', name: 'Mock', status: 'ACTIVE', mock: true }], mode: 'live' as const, profile: 'aic2024_v2' };

    const { unmount } = render(
      <SubmissionPanel
        selected={fixtureResult}
        evaluations={evals}
        onSubmitted={vi.fn()}
        onTaskKeyChange={onKey}
        onTaskTypeChange={onType}
        onEvaluationIdChange={onEval}
        onModeChange={onMode}
      />
    );

    fireEvent.change(screen.getByLabelText('Loại đáp án'), { target: { value: 'QA' } });
    expect(localStorage.getItem('cs336-task-type')).toBe('QA');
    expect(onType).toHaveBeenCalledWith('QA');

    fireEvent.change(screen.getByLabelText('Chế độ'), { target: { value: 'live' } });
    expect(localStorage.getItem('cs336-submit-mode')).toBe('live');
    expect(onMode).toHaveBeenCalledWith('live');

    fireEvent.change(screen.getByLabelText('Evaluation'), { target: { value: 'live-eval-1' } });
    expect(localStorage.getItem('cs336-eval-id')).toBe('live-eval-1');
    expect(onEval).toHaveBeenCalledWith('live-eval-1');

    fireEvent.change(screen.getByLabelText('Task / round key'), { target: { value: 'round-99' } });
    expect(localStorage.getItem('cs336-task-key')).toBe('round-99');
    expect(onKey).toHaveBeenCalledWith('round-99');

    unmount();

    // Re-mount (as happens after a new search when selecting a new keyframe)
    render(
      <SubmissionPanel
        selected={{ ...fixtureResult, keyframe_id: 'new-k2' }}
        evaluations={evals}
        onSubmitted={vi.fn()}
      />
    );

    expect((screen.getByLabelText('Loại đáp án') as HTMLSelectElement).value).toBe('QA');
    expect((screen.getByLabelText('Chế độ') as HTMLSelectElement).value).toBe('live');
    expect((screen.getByLabelText('Evaluation') as HTMLSelectElement).value).toBe('live-eval-1');
    expect((screen.getByLabelText('Task / round key') as HTMLInputElement).value).toBe('round-99');
  });
});

describe('player time contract', () => {
  it('seeks ms / 1000 after metadata and cleans listeners when frame changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ results: [] })));
    const props = { evaluations: null, saved: false, imageAvailable: false, onClose: vi.fn(), onSelect: vi.fn(), onSave: vi.fn(), onFeedback: vi.fn(), onExample: vi.fn(), onSubmitted: vi.fn() };
    const { rerender } = render(<Inspector selected={fixtureResult} {...props} />);
    const video = screen.getByLabelText('Video FIXTURE_VIDEO') as HTMLVideoElement;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(12.34);
    const remove = vi.spyOn(video, 'removeEventListener');
    rerender(<Inspector selected={{ ...fixtureResult, keyframe_id: 'fixture-k2', timestamp_ms: 23456 }} {...props} />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(23.456);
    expect(remove).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    await waitFor(() => expect(screen.queryByText('Đang tải filmstrip…')).not.toBeInTheDocument());
  });

  it('switches between submit, media and all tabs in Inspector and persists preference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ results: [] })));
    localStorage.removeItem('cs336-inspector-tab');
    const props = { evaluations: null, saved: false, imageAvailable: false, onClose: vi.fn(), onSelect: vi.fn(), onSave: vi.fn(), onFeedback: vi.fn(), onExample: vi.fn(), onSubmitted: vi.fn() };
    render(<Inspector selected={fixtureResult} {...props} />);

    // Default tab is submit
    expect(screen.getByRole('tab', { name: /Nộp bài DRES/i })).toHaveClass('active');
    expect(screen.getByText('12340 ms · PTS')).toBeInTheDocument();

    // Switch to media tab
    fireEvent.click(screen.getByRole('tab', { name: /Video & Chi tiết/i }));
    expect(screen.getByRole('tab', { name: /Video & Chi tiết/i })).toHaveClass('active');
    expect(localStorage.getItem('cs336-inspector-tab')).toBe('media');
    expect(screen.getByText('Sang phần nộp bài DRES →')).toBeInTheDocument();

    // Click quick CTA to return to submit tab
    fireEvent.click(screen.getByText('Sang phần nộp bài DRES →'));
    expect(screen.getByRole('tab', { name: /Nộp bài DRES/i })).toHaveClass('active');
    expect(localStorage.getItem('cs336-inspector-tab')).toBe('submit');
  });
});

describe('request races', () => {
  it('aborts old search and ignores its late response', async () => {
    const pending: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (url === '/api/search') return new Promise<Response>(resolve => pending.push({ resolve, signal: options!.signal! }));
      if (url === '/api/health') return Promise.resolve(json({ status: 'ok' }));
      if (url === '/api/capabilities') return Promise.resolve(json({ modes: { visual_text: false, image: false, ocr: true, asr: false, hybrid: false, temporal: false }, reasons: {}, contest_mode: false, fixture: true }));
      if (url === '/api/data') return Promise.resolve(json({ videos: [], counts: { videos: 0, keyframes: 0, ocr: 1, asr: 0 }, jobs: [], fixture: true }));
      if (url === '/api/dres/evaluations') return Promise.resolve(json({ evaluations: [], mode: 'dry_run', profile: 'fixture' }));
      if (url === '/api/evaluation') return Promise.resolve(json({ reports: [], ground_truth_available: false }));
      if (url === '/api/history') return Promise.resolve(json({ queries: [], submissions: [] }));
      return Promise.resolve(json({ candidates: [] }));
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Backend kết nối')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'OCR' }));
    const input = screen.getByLabelText('Nội dung truy vấn');
    fireEvent.change(input, { target: { value: 'first fixture query' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(input, { target: { value: 'second fixture query' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0].signal.aborted).toBe(true);
    await act(async () => pending[1].resolve(json({ results: [{ ...fixtureResult, media_item_name: 'FIXTURE_SECOND' }], elapsed_ms: 1, index_version: 'fixture-index' })));
    await screen.findByRole('button', { name: 'FIXTURE_SECOND' });
    await act(async () => pending[0].resolve(json({ results: [{ ...fixtureResult, media_item_name: 'FIXTURE_FIRST' }], elapsed_ms: 1, index_version: 'fixture-index' })));
    expect(screen.queryByRole('button', { name: 'FIXTURE_FIRST' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FIXTURE_SECOND' })).toBeInTheDocument();
  });
});

describe('DresSubmissionHub full integration', () => {
  it('renders and submits direct KIS payload correctly', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/dres/submit') {
        return json({ attempt_id: 'test-attempt', status: 'dry_run', payload: {} });
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DresSubmissionHub
        videos={[{ video_uid: 'v1', media_item_name: 'L22_V012', duration_ms: 1200000 }]}
        evaluations={{
          evaluations: [{ id: 'a64a8da4-9b83-4431-965e-262667dfe0d1', name: 'AI Challenge Round 1', status: 'ACTIVE' }],
          mode: 'live',
          profile: 'aic2024_v2',
        }}
        dresStatus={{
          base_url: 'https://aiclub.uit.edu.vn/dres',
          has_session: true,
          session_preview: '02VM...ZVz',
          mode: 'live',
          default_server: 'https://aiclub.uit.edu.vn/dres',
        }}
        history={{ queries: [], submissions: [] }}
        selectedKeyframe={null}
        onOpenDresConfig={vi.fn()}
        onSubmitted={vi.fn()}
        initialTaskKey="round-01"
        initialEvaluationId="a64a8da4-9b83-4431-965e-262667dfe0d1"
      />
    );

    // Verify tabs
    expect(screen.getByText('Textual KIS (TKIS)')).toBeInTheDocument();
    expect(screen.getByText('Visual KIS (VKIS)')).toBeInTheDocument();
    expect(screen.getByText('Q&A (Chuẩn AIC 2024)')).toBeInTheDocument();
    expect(screen.getByText('Video Item only')).toBeInTheDocument();

    // Verify Python code contains requests and L22_V012
    fireEvent.click(screen.getByRole('button', { name: /Code Python tương ứng/i }));
    expect(screen.getByText(/import requests/)).toBeInTheDocument();

    // Submit
    const submitBtn = screen.getByRole('button', { name: /NỘP BÀI THI LÊN DRES/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/dres/submit', expect.any(Object)));
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const submitCall = calls.find(call => call[0] === '/api/dres/submit');
    expect(submitCall).toBeDefined();
    const body = JSON.parse(String(submitCall![1].body));
    expect(body.media_item_name).toBe('L22_V012');
    expect(body.start_ms).toBe(453000);
    expect(body.end_ms).toBe(453000);
  });
});

describe('visual query auto-translation', () => {
  it('sends auto_translate flag in search and allows manual translation', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/health') return json({ status: 'ok' });
      if (url === '/api/capabilities') return json({ modes: { visual_text: true, image: false, ocr: false, asr: false, hybrid: false, temporal: false }, reasons: {}, contest_mode: false, fixture: false });
      if (url === '/api/data') return json({ videos: [], counts: { videos: 0, keyframes: 0, ocr: 0, asr: 0 }, jobs: [], fixture: false });
      if (url === '/api/dres/evaluations') return json({ evaluations: [], mode: 'dry_run', profile: 'fixture' });
      if (url === '/api/evaluation') return json({ reports: [], ground_truth_available: false });
      if (url === '/api/history') return json({ queries: [], submissions: [] });
      if (url === '/api/candidates') return json({ candidates: [] });
      if (url === '/api/dres/status') return json({ base_url: '', has_session: false, session_preview: '', mode: 'dry_run', default_server: '' });
      if (url === '/api/translate') {
        const body = JSON.parse(String(options?.body));
        return json({ original_text: body.text, translated_text: 'red car running on the bridge', success: true });
      }
      if (url === '/api/search') {
        return json({
          results: [{ ...fixtureResult, media_item_name: 'TEST_VIDEO' }],
          elapsed_ms: 12,
          index_version: 'openclip',
          translated_visual_query: 'red car running on the bridge',
        });
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText('Backend kết nối')).toBeInTheDocument());

    const input = screen.getByLabelText('Nội dung truy vấn');
    fireEvent.change(input, { target: { value: 'xe đỏ chạy qua cầu' } });

    // Click Manual Translate button
    const translateBtn = screen.getByRole('button', { name: /Dịch sang EN/i });
    fireEvent.click(translateBtn);

    await waitFor(() => {
      const visualInput = screen.getByLabelText(/Mô tả visual tiếng Anh/i) as HTMLInputElement;
      expect(visualInput.value).toBe('red car running on the bridge');
    });

    // Submit search
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const searchCall = calls.find(call => call[0] === '/api/search');
      expect(searchCall).toBeDefined();
      const body = JSON.parse(String(searchCall![1].body));
      expect(body.query).toBe('xe đỏ chạy qua cầu');
      expect(body.visual_query).toBe('red car running on the bridge');
      expect(body.auto_translate).toBe(true);
    });

    // Check display of translated visual query badge
    expect(await screen.findByText(/Visual EN:/)).toBeInTheDocument();
  });

  it('allows unchecking auto_translate and persists preference to localStorage', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/health') return json({ status: 'ok' });
      if (url === '/api/capabilities') return json({ modes: { visual_text: true, image: false, ocr: false, asr: false, hybrid: false, temporal: false }, reasons: {}, contest_mode: false, fixture: false });
      if (url === '/api/data') return json({ videos: [], counts: { videos: 0, keyframes: 0, ocr: 0, asr: 0 }, jobs: [], fixture: false });
      if (url === '/api/dres/evaluations') return json({ evaluations: [], mode: 'dry_run', profile: 'fixture' });
      if (url === '/api/evaluation') return json({ reports: [], ground_truth_available: false });
      if (url === '/api/history') return json({ queries: [], submissions: [] });
      if (url === '/api/candidates') return json({ candidates: [] });
      if (url === '/api/dres/status') return json({ base_url: '', has_session: false, session_preview: '', mode: 'dry_run', default_server: '' });
      if (url === '/api/search') {
        return json({
          results: [{ ...fixtureResult, media_item_name: 'TEST_VIDEO' }],
          elapsed_ms: 10,
          index_version: 'openclip',
        });
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await waitFor(() => expect(screen.getByText('Backend kết nối')).toBeInTheDocument());

    const toggle = screen.getByLabelText(/Auto-translate/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    // Uncheck toggle
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem('cs336-auto-translate')).toBe('false');

    const input = screen.getByLabelText('Nội dung truy vấn');
    fireEvent.change(input, { target: { value: 'người đi bộ' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const searchCall = calls.find(call => call[0] === '/api/search');
      expect(searchCall).toBeDefined();
      const body = JSON.parse(String(searchCall![1].body));
      expect(body.auto_translate).toBe(false);
    });
  });

  it('submits Q&A direct payload with text answer and updates preview in DresSubmissionHub', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/dres/submit') {
        return json({ attempt_id: 'qa-attempt', status: 'dry_run', payload: {} });
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DresSubmissionHub
        videos={[{ video_uid: 'v1', media_item_name: 'L22_V012', duration_ms: 1200000 }]}
        evaluations={{
          evaluations: [{ id: 'eval-round-1', name: 'AI Challenge Round 1', status: 'ACTIVE' }],
          mode: 'dry_run',
          profile: 'aic2024_v2',
        }}
        dresStatus={{
          base_url: 'https://aiclub.uit.edu.vn/dres',
          has_session: false,
          session_preview: '',
          mode: 'dry_run',
          default_server: 'https://aiclub.uit.edu.vn/dres',
        }}
        history={{ queries: [], submissions: [] }}
        selectedKeyframe={null}
        onOpenDresConfig={vi.fn()}
        onSubmitted={vi.fn()}
        initialTaskKey="round-01"
        initialEvaluationId="eval-round-1"
      />
    );

    // Select Q&A tab
    fireEvent.click(screen.getByText('Q&A (Chuẩn AIC 2024)'));

    // Input answer
    const answerInput = screen.getByLabelText(/Đáp án câu hỏi/i);
    fireEvent.change(answerInput, { target: { value: 'xe cứu thương' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /KIỂM TRA PAYLOAD|NỘP BÀI/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      const submitCall = calls.find(call => call[0] === '/api/dres/submit');
      expect(submitCall).toBeDefined();
      const body = JSON.parse(String(submitCall![1].body));
      expect(body.answer).toBe('xe cứu thương');
      expect(body.task_type).toBe('QA');
      expect(body.media_item_name).toBe('L22_V012');
    });
  });
});

