import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { AppController } from './../src/app.controller';

describe('AppController (e2e)', () => {
  let appController: AppController;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appController = moduleFixture.get(AppController);
  });

  it('root returns OK', () => {
    expect(appController.root()).toBe('OK');
  });

  it('health-check returns OK', () => {
    expect(appController.healthCheck()).toBe('OK');
  });
});
