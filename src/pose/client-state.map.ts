type ClientStatus = 'open' | 'closing';

type ClientState<T> = {
  status: ClientStatus;
  value: T;
};

export class ClientStateMap<T> {
  private readonly entries = new Map<string, ClientState<T>>();

  public get(clientId: string): T | undefined {
    return this.entries.get(clientId)?.value;
  }

  public getOrCreateOpen(clientId: string, create: () => T): T | undefined {
    const existing = this.entries.get(clientId);
    if (existing) {
      return existing.status === 'open' ? existing.value : undefined;
    }

    const value = create();
    this.entries.set(clientId, { status: 'open', value });
    return value;
  }

  public markClosing(clientId: string): T | undefined {
    const existing = this.entries.get(clientId);
    if (!existing) {
      return undefined;
    }

    existing.status = 'closing';
    return existing.value;
  }

  public delete(clientId: string): void {
    this.entries.delete(clientId);
  }

  public keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}
