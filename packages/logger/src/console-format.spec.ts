import { MESSAGE } from 'triple-beam';
import { createConsoleFormat } from './console-format';

describe('createConsoleFormat', () => {
  it('production 환경에서는 JSON 한 줄로 출력한다', () => {
    const format = createConsoleFormat(
      'production',
      () => 'should-not-be-used',
    );
    const info = format.transform(
      { level: 'info', message: '방 생성됨', service: 'game' },
      {},
    ) as Record<string | symbol, unknown>;

    const output = info[MESSAGE] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      level: 'info',
      message: '방 생성됨',
      service: 'game',
    });
  });

  it('production이 아닌 환경에서는 전달받은 prettyPrint 함수를 사용한다', () => {
    const prettyPrint = jest.fn(() => 'PRETTY LINE');
    const format = createConsoleFormat('development', prettyPrint);

    const info = format.transform(
      { level: 'info', message: '방 생성됨', service: 'game' },
      {},
    ) as Record<string | symbol, unknown>;

    expect(prettyPrint).toHaveBeenCalled();
    expect(info[MESSAGE]).toBe('PRETTY LINE');
  });
});
