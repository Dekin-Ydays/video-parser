import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { PoseFrame } from './types/pose.types';
import { ClientStateMap } from './client-state.map';
import { normalizeFrame } from './utils/pose.normalization';
import { PoseRecordingSessionService } from './pose-recording-session.service';

type ClientBufferState = {
  frames: PoseFrame[];
  flushTimer: NodeJS.Timeout | null;
  inFlight: Promise<void>;
};

@Injectable()
export class FrameBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(FrameBufferService.name);
  private readonly stateByClientId = new ClientStateMap<ClientBufferState>();
  private readonly maxFramesPerFlush = 20;
  private readonly flushIntervalMs = 500;

  public constructor(
    private readonly sessionService: PoseRecordingSessionService,
  ) {}

  public appendPayload(clientId: string, payload: unknown): boolean {
    const frame = normalizeFrame(payload);
    if (!frame) {
      return false;
    }

    const state = this.stateByClientId.getOrCreateOpen(clientId, () => ({
      frames: [],
      flushTimer: null,
      inFlight: Promise.resolve(),
    }));
    if (!state) {
      return false;
    }

    state.frames.push(frame);

    if (state.frames.length >= this.maxFramesPerFlush) {
      void this.flushClient(clientId);
      return true;
    }

    this.ensureFlushTimer(clientId, state);
    return true;
  }

  public async flushClient(clientId: string): Promise<void> {
    const state = this.stateByClientId.get(clientId);
    if (!state) {
      return;
    }

    this.clearFlushTimer(state);
    if (state.frames.length === 0) {
      await state.inFlight;
      return;
    }

    const framesToFlush = state.frames;
    state.frames = [];

    state.inFlight = state.inFlight
      .catch(() => undefined)
      .then(async () => {
        await this.sessionService.upsertLatestBatch(clientId, framesToFlush);
      })
      .catch((error) => {
        this.logger.error(
          `Failed to flush buffered frames for clientId=${clientId}`,
          error,
        );
      });

    await state.inFlight;
  }

  public async disconnectClient(clientId: string): Promise<void> {
    const state = this.stateByClientId.markClosing(clientId);
    if (!state) {
      return;
    }

    await this.flushClient(clientId);
    await state.inFlight;
    this.stateByClientId.delete(clientId);
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.stateByClientId.keys()].map((clientId) =>
        this.disconnectClient(clientId),
      ),
    );
  }

  private ensureFlushTimer(clientId: string, state: ClientBufferState): void {
    if (state.flushTimer) {
      return;
    }

    state.flushTimer = setTimeout(() => {
      void this.flushClient(clientId);
    }, this.flushIntervalMs);
  }

  private clearFlushTimer(state: ClientBufferState): void {
    if (!state.flushTimer) {
      return;
    }

    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
}
