import { AppService } from './app.service';

describe('AppService', () => {
  it('returns OK', () => {
    expect(new AppService().getOk()).toBe('OK');
  });
});
