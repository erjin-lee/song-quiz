import { OpenAiChatClient, OpenAiChatError } from './openai-chat.client';

const createMock = jest.fn();

// tsconfig에 esModuleInterop이 꺼져 있어 `import OpenAI from 'openai'`가
// 컴파일 시 `.default`를 직접 참조한다. 실제 openai 패키지도 CJS/ESM 겸용을
// 위해 constructor 자신을 `.default`로도 노출하므로 mock도 동일한 모양을
// 맞춰야 `new OpenAI(...)` 호출이 constructor를 찾는다.
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    responses: { create: createMock },
  }));
  return Object.assign(MockOpenAI, { default: MockOpenAI });
});

describe('OpenAiChatClient', () => {
  let client: OpenAiChatClient;
  const originalApiKey = process.env.GPT_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GPT_SECRET_KEY = 'test-api-key';
    client = new OpenAiChatClient();
  });

  afterAll(() => {
    process.env.GPT_SECRET_KEY = originalApiKey;
  });

  it('GPT_SECRET_KEY가 없으면 OpenAiChatError를 던지고 API를 호출하지 않는다', async () => {
    delete process.env.GPT_SECRET_KEY;

    await expect(
      client.requestJson([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(OpenAiChatError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('정상 응답이면 content를 반환하고 json_object 응답 형식으로 요청한다', async () => {
    createMock.mockResolvedValue({ output_text: '{"ok":true}' });

    const result = await client.requestJson([
      { role: 'system', content: 'system rule' },
      { role: 'user', content: 'hi' },
    ]);

    expect(result).toBe('{"ok":true}');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-luna',
        input: [
          { role: 'system', content: 'system rule' },
          { role: 'user', content: 'hi' },
        ],
        text: { format: { type: 'json_object' } },
      }),
    );
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('tools');
  });

  it('webSearch 옵션을 켜면 web_search 도구를 함께 요청한다', async () => {
    createMock.mockResolvedValue({ output_text: '{"ok":true}' });

    await client.requestJson([{ role: 'user', content: 'hi' }], {
      webSearch: true,
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: 'web_search' }],
      }),
    );
    // web_search는 강제 JSON 모드와 함께 쓸 수 없어(OpenAI 제약) 켜지 않는다.
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('text');
  });

  it('응답에 content가 없으면 OpenAiChatError를 던진다', async () => {
    createMock.mockResolvedValue({ output_text: '' });

    await expect(
      client.requestJson([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(OpenAiChatError);
  });

  it('SDK 호출이 실패하면 해당 에러를 그대로 던진다', async () => {
    createMock.mockRejectedValue(new Error('network down'));

    await expect(
      client.requestJson([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('network down');
  });
});
