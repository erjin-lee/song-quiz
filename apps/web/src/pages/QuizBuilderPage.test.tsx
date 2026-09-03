import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizBuilderPage } from './QuizBuilderPage';
import { useSession } from '../context/SessionContext';
import {
  autoFillYoutubeLink,
  createQuiz,
  getAnswerCandidates,
  getQuizForEdit,
  getRegistrationEligibility,
  searchDbSongs,
  updateQuiz,
  validateYoutubeLink,
} from '../api/quiz-registration';
import type {
  DbSongSearchResultDto,
  QuizEditDetailDto,
  YoutubeLinkValidationResultDto,
} from '../types/quiz-registration';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));

vi.mock('../api/quiz-registration', () => ({
  searchDbSongs: vi.fn(),
  searchMelonSongs: vi.fn(),
  registerSongFromMelon: vi.fn(),
  getAnswerCandidates: vi.fn(),
  validateYoutubeLink: vi.fn(),
  autoFillYoutubeLink: vi.fn(),
  getRegistrationEligibility: vi.fn(),
  createQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  getQuizForEdit: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);
const mockedSearchDbSongs = vi.mocked(searchDbSongs);
const mockedValidateYoutubeLink = vi.mocked(validateYoutubeLink);
const mockedAutoFillYoutubeLink = vi.mocked(autoFillYoutubeLink);
const mockedGetRegistrationEligibility = vi.mocked(getRegistrationEligibility);
const mockedCreateQuiz = vi.mocked(createQuiz);
const mockedUpdateQuiz = vi.mocked(updateQuiz);
const mockedGetQuizForEdit = vi.mocked(getQuizForEdit);
const mockedGetAnswerCandidates = vi.mocked(getAnswerCandidates);

// 이 파일은 여러 번의 클릭+비동기 검증을 반복하는 테스트가 많아서, 다른
// 워크스페이스와 동시에 테스트가 도는 환경(예: 루트 yarn test)에서 CPU
// 경합으로 기본 타임아웃(findBy/waitFor 1000ms, 테스트 자체 5000ms)을
// 넘기는 flake가 있었다 - 전부 넉넉히 잡는다.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 20000 });

function waitForLong<T>(callback: () => T | Promise<T>) {
  return waitFor(callback, { timeout: 8000 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeSessionValue(
  overrides: Partial<ReturnType<typeof useSession>>,
): ReturnType<typeof useSession> {
  return {
    nickname: '닉네임',
    setNickname: vi.fn(),
    isAuthenticated: true,
    isInitialized: true,
    accountUserId: 'user-1',
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function makeDbResult(
  overrides: Partial<DbSongSearchResultDto> = {},
): DbSongSearchResultDto {
  return {
    songId: 's1',
    songNm: '봄날',
    atstNm: '방탄소년단',
    displayLabel: '봄날 - 방탄소년단',
    ytbLink: null,
    ...overrides,
  };
}

function renderNewBuilder() {
  return render(
    <MemoryRouter initialEntries={['/quizzes/new']}>
      <Routes>
        <Route path="/quizzes/new" element={<QuizBuilderPage />} />
        <Route path="/quizzes/:quizId/edit" element={<QuizBuilderPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/mypage" element={<div>마이페이지 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditBuilder(quizId: string) {
  return render(
    <MemoryRouter initialEntries={[`/quizzes/${quizId}/edit`]}>
      <Routes>
        <Route path="/quizzes/new" element={<QuizBuilderPage />} />
        <Route path="/quizzes/:quizId/edit" element={<QuizBuilderPage />} />
        <Route path="/rooms" element={<div>방 목록 화면</div>} />
        <Route path="/mypage" element={<div>마이페이지 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuizBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGetRegistrationEligibility.mockResolvedValue({
      eligible: true,
      remainingSeconds: 0,
    });
    mockedGetAnswerCandidates.mockResolvedValue([]);
  });

  it('비로그인 상태면 방 목록으로 이동한다', async () => {
    mockedUseSession.mockReturnValue(
      makeSessionValue({ isAuthenticated: false }),
    );

    renderNewBuilder();

    expect(await screen.findByText('방 목록 화면')).toBeInTheDocument();
  });

  it('24시간 제한에 걸려 있으면 등록 폼 대신 안내를 보여준다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetRegistrationEligibility.mockResolvedValue({
      eligible: false,
      remainingSeconds: 3600,
    });

    renderNewBuilder();

    expect(
      await screen.findByText('1시간 0분 후 다시 등록할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('예) 내가 좋아하는 노래 모음')).not.toBeInTheDocument();
  });

  it('곡을 검색해서 담고 링크를 확인하면 카드가 통과 상태가 된다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockResolvedValue([makeDbResult()]);
    mockedValidateYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'token-1',
    });
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('곡명 또는 아티스트명으로 검색'),
      '봄날',
    );
    await user.click(await screen.findByText('봄날 - 방탄소년단'));

    expect(await screen.findByText('봄날')).toBeInTheDocument();

    await user.click(screen.getByText('봄날'));
    await user.type(
      screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'),
      'https://www.youtube.com/watch?v=v1',
    );
    await user.type(
      screen.getByPlaceholderText('정답 추가 후 Enter'),
      '봄날{enter}',
    );
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(mockedValidateYoutubeLink).toHaveBeenCalledWith(
      's1',
      'https://www.youtube.com/watch?v=v1',
    );
    await waitForLong(() => {
      expect(screen.getByText('✅')).toBeInTheDocument();
    });
  });

  it('최소 곡 수를 채우고 모두 통과해야 등록 버튼이 활성화된다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockImplementation((keyword) =>
      Promise.resolve([
        makeDbResult({
          songId: keyword,
          songNm: keyword,
          displayLabel: keyword,
        }),
      ]),
    );
    mockedValidateYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'token-1',
    });
    mockedCreateQuiz.mockResolvedValue({ quizId: 'quiz-1' });
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('예) 내가 좋아하는 노래 모음'),
      '내 퀴즈',
    );

    const searchInput = screen.getByPlaceholderText(
      '곡명 또는 아티스트명으로 검색',
    );
    for (let i = 1; i <= 5; i += 1) {
      await user.clear(searchInput);
      await user.type(searchInput, `곡${i}`);
      await user.click(await screen.findByText(`곡${i}`));
    }
    // 검색창에 남아 있으면 검색 결과 목록의 "이미 담음" 항목과 담은 곡
    // 카드가 같은 텍스트를 가져 이후 조회가 모호해진다.
    await user.clear(searchInput);

    expect(screen.getByText(/담은 곡 5곡/)).toBeInTheDocument();

    const registerButton = screen.getByRole('button', { name: '등록하기' });
    expect(registerButton).toBeDisabled();

    for (let i = 1; i <= 5; i += 1) {
      await user.click(screen.getAllByText(`곡${i}`)[0]);
      await user.type(
        screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'),
        `https://www.youtube.com/watch?v=v${i}`,
      );
      await user.type(
        screen.getByPlaceholderText('정답 추가 후 Enter'),
        `정답${i}{enter}`,
      );
      await user.click(screen.getByRole('button', { name: '확인' }));
      await waitForLong(() => {
        expect(mockedValidateYoutubeLink).toHaveBeenCalledWith(
          `곡${i}`,
          `https://www.youtube.com/watch?v=v${i}`,
        );
      });
    }

    await waitForLong(() => {
      expect(screen.getByRole('button', { name: '등록하기' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: '등록하기' }));

    await waitForLong(() => {
      expect(mockedCreateQuiz).toHaveBeenCalledWith(
        expect.objectContaining({
          quizTtl: '내 퀴즈',
          songs: expect.arrayContaining([
            expect.objectContaining({ verificationToken: 'token-1' }),
          ]),
        }),
      );
    });
    expect(await screen.findByText('마이페이지 화면')).toBeInTheDocument();
  });

  it('링크가 공란인 곡은 자동으로 찾기 버튼으로 검증을 트리거한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockResolvedValue([makeDbResult()]);
    mockedAutoFillYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 100,
      endSec: 130,
      reason: null,
      verificationToken: 'auto-token',
    });
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('곡명 또는 아티스트명으로 검색'),
      '봄날',
    );
    await user.click(await screen.findByText('봄날 - 방탄소년단'));

    await user.click(
      await screen.findByRole('button', { name: '자동으로 찾기' }),
    );

    await waitForLong(() => {
      expect(mockedAutoFillYoutubeLink).toHaveBeenCalledWith('s1');
      expect(screen.getByText('✅')).toBeInTheDocument();
    });
  });

  it('자동으로 찾기 후 정답 후보가 있으면 자동으로 채워서 정답 없음 경고가 뜨지 않는다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockResolvedValue([makeDbResult()]);
    mockedAutoFillYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'auto-token',
    });
    mockedGetAnswerCandidates.mockResolvedValue(['봄날', 'Spring Day']);
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('곡명 또는 아티스트명으로 검색'),
      '봄날',
    );
    await user.click(await screen.findByText('봄날 - 방탄소년단'));
    await user.click(
      await screen.findByRole('button', { name: '자동으로 찾기' }),
    );

    await waitForLong(() => {
      expect(mockedGetAnswerCandidates).toHaveBeenCalledWith('s1');
      expect(screen.getByText('✅')).toBeInTheDocument();
    });
    expect(screen.queryByText('정답 없음')).not.toBeInTheDocument();
  });

  it('정답이 없는 곡이 있으면 나머지 조건을 만족해도 등록 버튼이 비활성 상태를 유지한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockImplementation((keyword) =>
      Promise.resolve([
        makeDbResult({
          songId: keyword,
          songNm: keyword,
          displayLabel: keyword,
        }),
      ]),
    );
    mockedAutoFillYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'auto-token',
    });
    mockedGetAnswerCandidates.mockResolvedValue([]);
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('예) 내가 좋아하는 노래 모음'),
      '내 퀴즈',
    );
    const searchInput = screen.getByPlaceholderText(
      '곡명 또는 아티스트명으로 검색',
    );
    for (let i = 1; i <= 5; i += 1) {
      await user.clear(searchInput);
      await user.type(searchInput, `곡${i}`);
      await user.click(await screen.findByText(`곡${i}`));
    }
    await user.clear(searchInput);

    for (const button of screen.getAllByRole('button', {
      name: '자동으로 찾기',
    })) {
      await user.click(button);
    }

    await waitForLong(() => {
      expect(screen.getAllByText('✅')).toHaveLength(5);
    });

    expect(screen.getByRole('button', { name: '등록하기' })).toBeDisabled();
    expect(screen.getAllByText('정답 없음').length).toBe(5);
  });

  it('이전 링크 검증 응답이 나중에 도착해도 최신 링크 상태를 덮어쓰지 않는다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedSearchDbSongs.mockResolvedValue([makeDbResult()]);
    const first = deferred<YoutubeLinkValidationResultDto>();
    const second = deferred<YoutubeLinkValidationResultDto>();
    mockedValidateYoutubeLink
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const user = userEvent.setup();

    renderNewBuilder();
    await user.type(
      await screen.findByPlaceholderText('곡명 또는 아티스트명으로 검색'),
      '봄날',
    );
    await user.click(await screen.findByText('봄날 - 방탄소년단'));

    // 1차 저장: 링크 A(아직 응답 대기 중)
    await user.click(screen.getByText('봄날'));
    await user.type(
      screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'),
      'https://www.youtube.com/watch?v=vA',
    );
    await user.type(
      screen.getByPlaceholderText('정답 추가 후 Enter'),
      '정답A{enter}',
    );
    await user.click(screen.getByRole('button', { name: '확인' }));

    // A 응답이 오기 전에 링크 B로 다시 저장
    await user.click(screen.getByText('봄날'));
    const urlInput = screen.getByPlaceholderText(
      'https://www.youtube.com/watch?v=...',
    );
    await user.clear(urlInput);
    await user.type(urlInput, 'https://www.youtube.com/watch?v=vB');
    await user.click(screen.getByRole('button', { name: '확인' }));

    // B가 먼저 응답
    second.resolve({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=vB',
      youtubeVideoId: 'vB',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'token-B',
    });
    await waitForLong(() => {
      expect(screen.getByText('✅')).toBeInTheDocument();
    });

    // A가 뒤늦게 응답 - 무시되어야 한다
    first.resolve({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=vA',
      youtubeVideoId: 'vA',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'token-A',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    await user.click(screen.getByText('봄날'));
    expect(
      screen.getByDisplayValue('https://www.youtube.com/watch?v=vB'),
    ).toBeInTheDocument();
  });

  it('수정 화면 진입 시 서버가 재검증에 통과시킨 기존 곡은 바로 확인 완료 상태로 표시한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    const detail: QuizEditDetailDto = {
      quizId: 'quiz-1',
      quizTtl: '기존 퀴즈',
      quizDesc: '기존 설명',
      songs: [
        {
          songId: 's1',
          songNm: '봄날',
          atstNm: '방탄소년단',
          youtubeUrl: 'https://www.youtube.com/watch?v=v1',
          answers: ['봄날'],
          verificationToken: 'server-issued-token',
          failReason: null,
        },
      ],
    };
    mockedGetQuizForEdit.mockResolvedValue(detail);

    renderEditBuilder('quiz-1');

    expect(await screen.findByDisplayValue('기존 퀴즈')).toBeInTheDocument();
    expect(screen.getByText('봄날')).toBeInTheDocument();
    expect(screen.getByText('✅')).toBeInTheDocument();
    // 곡이 1개뿐이라 최소 곡 수(5) 조건 때문에 여전히 비활성 상태다.
    expect(screen.getByRole('button', { name: '수정하기' })).toBeDisabled();
  });

  it('수정 화면 진입 시 토큰이 없는 곡(이상 상태)은 실패 상태로 표시한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetQuizForEdit.mockResolvedValue({
      quizId: 'quiz-1',
      quizTtl: '기존 퀴즈',
      quizDesc: null,
      songs: [
        {
          songId: 's1',
          songNm: '봄날',
          atstNm: '방탄소년단',
          youtubeUrl: 'https://www.youtube.com/watch?v=v1',
          answers: ['봄날'],
          verificationToken: null,
          failReason:
            '유튜브 영상 정보를 확인할 수 없습니다. 링크를 다시 확인해주세요.',
        },
      ],
    });

    renderEditBuilder('quiz-1');

    expect(await screen.findByDisplayValue('기존 퀴즈')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('수정 제출은 updateQuiz를 호출한다', async () => {
    mockedUseSession.mockReturnValue(makeSessionValue({}));
    mockedGetQuizForEdit.mockResolvedValue({
      quizId: 'quiz-1',
      quizTtl: '기존 퀴즈',
      quizDesc: null,
      songs: Array.from({ length: 5 }, (_, i) => ({
        songId: `s${i + 1}`,
        songNm: `곡${i + 1}`,
        atstNm: '아티스트',
        youtubeUrl: `https://www.youtube.com/watch?v=v${i + 1}`,
        answers: [`정답${i + 1}`],
        // 서버 재검증에 실패한 것으로 시작해서, 유저가 직접 다시 확인하는
        // 기존 흐름을 그대로 검증한다.
        verificationToken: null,
        failReason: '영상을 확인할 수 없습니다.',
      })),
    });
    mockedValidateYoutubeLink.mockResolvedValue({
      valid: true,
      youtubeUrl: 'https://www.youtube.com/watch?v=v1',
      youtubeVideoId: 'v1',
      durationSec: 200,
      startSec: 0,
      endSec: 30,
      reason: null,
      verificationToken: 'token',
    });
    mockedUpdateQuiz.mockResolvedValue({ quizId: 'quiz-1' });
    const user = userEvent.setup();

    renderEditBuilder('quiz-1');
    await screen.findByDisplayValue('기존 퀴즈');

    for (let i = 1; i <= 5; i += 1) {
      await user.click(screen.getByText(`곡${i}`));
      await user.click(screen.getByRole('button', { name: '확인' }));
      await waitForLong(() => {
        expect(mockedValidateYoutubeLink).toHaveBeenCalledWith(
          `s${i}`,
          `https://www.youtube.com/watch?v=v${i}`,
        );
      });
    }

    await waitForLong(() => {
      expect(screen.getByRole('button', { name: '수정하기' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '수정하기' }));

    await waitForLong(() => {
      expect(mockedUpdateQuiz).toHaveBeenCalledWith(
        'quiz-1',
        expect.objectContaining({ quizTtl: '기존 퀴즈' }),
      );
    });
  });
});
