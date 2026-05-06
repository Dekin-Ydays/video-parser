import { ConfigService } from '@nestjs/config';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: sendMock,
    })),
    HeadBucketCommand: jest.fn().mockImplementation((args) => ({
      __type: 'HeadBucketCommand',
      ...args,
    })),
    CreateBucketCommand: jest.fn().mockImplementation((args) => ({
      __type: 'CreateBucketCommand',
      ...args,
    })),
    PutObjectCommand: jest.fn().mockImplementation((args) => ({
      __type: 'PutObjectCommand',
      ...args,
    })),
    GetObjectCommand: jest.fn().mockImplementation((args) => ({
      __type: 'GetObjectCommand',
      ...args,
    })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MinioService } = require('./minio.service') as typeof import('./minio.service');

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    MINIO_BUCKET: 'test-bucket',
    MINIO_ENDPOINT: 'http://test-minio:9000',
    MINIO_REGION: 'us-east-1',
    MINIO_ACCESS_KEY: 'k',
    MINIO_SECRET_KEY: 's',
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('MinioService.getStatus', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('reports ready=true after a successful HeadBucketCommand', async () => {
    sendMock.mockResolvedValue({});
    const service = new MinioService(makeConfig());
    await service.onModuleInit();

    const status = service.getStatus();
    expect(status.ready).toBe(true);
    expect(status.endpoint).toBe('http://test-minio:9000');
    expect(status.bucket).toBe('test-bucket');
    expect(status.error).toBeUndefined();
  });

  it('reports ready=false with an error when the bucket call fails', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    sendMock.mockRejectedValue(err);

    const service = new MinioService(makeConfig());
    await service.onModuleInit();

    const status = service.getStatus();
    expect(status.ready).toBe(false);
    expect(status.error).toContain('ECONNREFUSED');
  });

  it('creates the bucket when HeadBucketCommand returns 404', async () => {
    const notFound = Object.assign(new Error('not found'), {
      $metadata: { httpStatusCode: 404 },
    });
    sendMock
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({});

    const service = new MinioService(makeConfig());
    await service.onModuleInit();

    expect(service.getStatus().ready).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
