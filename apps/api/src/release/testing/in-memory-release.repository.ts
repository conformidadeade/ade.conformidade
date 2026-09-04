import { createInitialState } from "@reanalise-erp/release-engine";
import { randomUUID } from "crypto";
import { CombinationNotFoundError, GuidelineNotConfiguredError } from "../errors";
import {
  CombinationRecord,
  CreateProcessInput,
  CreateReturnInput,
  FindOrCreateCombinationInput,
  ReleaseRepositoryPort,
  ReleaseUnitOfWork,
  SaveStateAndEventsInput,
} from "../release-repository.port";

const key = (a: string, c: string, m: string) => `${a}:${c}:${m}`;

/**
 * Fake em memória da porta de persistência — usado só em teste. Não
 * simula rollback de transação (não é necessário para verificar a
 * orquestração de negócio); a atomicidade real é responsabilidade do
 * Prisma em produção (ver prisma-release.repository.ts).
 */
export class InMemoryReleaseRepository implements ReleaseRepositoryPort, ReleaseUnitOfWork {
  readonly combinations = new Map<string, CombinationRecord>();
  readonly guidelines = new Map<string, number>();
  readonly processes: Array<CreateProcessInput & { id: string }> = [];
  readonly returns: Array<CreateReturnInput & { id: string }> = [];
  readonly events: Array<{ combinationId: string; type: string; detail: unknown }> = [];

  setGuideline(clientId: string, mediaChannelId: string, target: number) {
    this.guidelines.set(key("*", clientId, mediaChannelId), target);
  }

  async runInTransaction<T>(work: (repo: ReleaseRepositoryPort) => Promise<T>): Promise<T> {
    return work(this);
  }

  async findOrCreateCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord> {
    const k = key(input.analystId, input.clientId, input.mediaChannelId);
    const existing = this.combinations.get(k);
    if (existing) return existing;
    const created: CombinationRecord = {
      id: randomUUID(),
      analystId: input.analystId,
      clientId: input.clientId,
      mediaChannelId: input.mediaChannelId,
      state: createInitialState(),
    };
    this.combinations.set(k, created);
    return created;
  }

  async getCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord> {
    const existing = this.combinations.get(key(input.analystId, input.clientId, input.mediaChannelId));
    if (!existing) {
      throw new CombinationNotFoundError(input.analystId, input.clientId, input.mediaChannelId);
    }
    return existing;
  }

  async getCurrentGuidelineTarget(input: { clientId: string; mediaChannelId: string }): Promise<number> {
    const target = this.guidelines.get(key("*", input.clientId, input.mediaChannelId));
    if (target === undefined) {
      throw new GuidelineNotConfiguredError(input.clientId, input.mediaChannelId);
    }
    return target;
  }

  async findDuplicateProcess(input: {
    combinationId: string;
    piNumber: string;
    analysisDate: Date;
  }): Promise<{ id: string } | null> {
    const found = this.processes.find(
      (p) =>
        p.combinationId === input.combinationId &&
        p.piNumber === input.piNumber &&
        p.analysisDate.getTime() === input.analysisDate.getTime(),
    );
    return found ? { id: found.id } : null;
  }

  async createProcess(input: CreateProcessInput): Promise<{ id: string }> {
    const id = randomUUID();
    this.processes.push({ ...input, id });
    return { id };
  }

  async createReturn(input: CreateReturnInput): Promise<{ id: string }> {
    const id = randomUUID();
    this.returns.push({ ...input, id });
    return { id };
  }

  async saveStateAndEvents(input: SaveStateAndEventsInput): Promise<void> {
    for (const [k, combination] of this.combinations.entries()) {
      if (combination.id === input.combinationId) {
        this.combinations.set(k, { ...combination, state: input.state });
      }
    }
    for (const event of input.events) {
      this.events.push({ combinationId: input.combinationId, type: event.type, detail: event.detail });
    }
  }
}
