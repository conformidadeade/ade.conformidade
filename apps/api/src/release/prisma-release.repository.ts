import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CombinationState, createInitialState } from "@reanalise-erp/release-engine";
import { PrismaService } from "../prisma/prisma.service";
import { CombinationNotFoundError, GuidelineNotConfiguredError } from "./errors";
import {
  CombinationRecord,
  CreateProcessInput,
  CreateReturnInput,
  FindOrCreateCombinationInput,
  ReleaseRepositoryPort,
  ReleaseUnitOfWork,
  SaveStateAndEventsInput,
} from "./release-repository.port";

type Tx = Prisma.TransactionClient;

function toState(model: {
  status: string;
  constructionCount: number;
  monthlyReturnCount: number;
  monthlyReturnMonthKey: string | null;
  releasedAt: Date | null;
  lastReturnAt: Date | null;
  lastReturnReason: string | null;
}): CombinationState {
  return {
    status: model.status as CombinationState["status"],
    constructionCount: model.constructionCount,
    monthlyReturnCount: model.monthlyReturnCount,
    monthlyReturnMonthKey: model.monthlyReturnMonthKey,
    releasedAt: model.releasedAt,
    lastReturnAt: model.lastReturnAt,
    lastReturnReason: model.lastReturnReason,
  };
}

/** Implementação da porta de persistência sobre um Prisma.TransactionClient. */
class TxReleaseRepository implements ReleaseRepositoryPort {
  constructor(private readonly tx: Tx) {}

  async findOrCreateCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord> {
    const existing = await this.tx.analystClientMedia.findUnique({
      where: {
        analystId_clientId_mediaChannelId: {
          analystId: input.analystId,
          clientId: input.clientId,
          mediaChannelId: input.mediaChannelId,
        },
      },
    });
    if (existing) {
      return {
        id: existing.id,
        analystId: existing.analystId,
        clientId: existing.clientId,
        mediaChannelId: existing.mediaChannelId,
        state: toState(existing),
      };
    }
    const initial = createInitialState();
    const created = await this.tx.analystClientMedia.create({
      data: {
        analystId: input.analystId,
        clientId: input.clientId,
        mediaChannelId: input.mediaChannelId,
        status: initial.status,
        constructionCount: initial.constructionCount,
        monthlyReturnCount: initial.monthlyReturnCount,
      },
    });
    return {
      id: created.id,
      analystId: created.analystId,
      clientId: created.clientId,
      mediaChannelId: created.mediaChannelId,
      state: toState(created),
    };
  }

  async getCombination(input: FindOrCreateCombinationInput): Promise<CombinationRecord> {
    const existing = await this.tx.analystClientMedia.findUnique({
      where: {
        analystId_clientId_mediaChannelId: {
          analystId: input.analystId,
          clientId: input.clientId,
          mediaChannelId: input.mediaChannelId,
        },
      },
    });
    if (!existing) {
      throw new CombinationNotFoundError(input.analystId, input.clientId, input.mediaChannelId);
    }
    return {
      id: existing.id,
      analystId: existing.analystId,
      clientId: existing.clientId,
      mediaChannelId: existing.mediaChannelId,
      state: toState(existing),
    };
  }

  async getCurrentGuidelineTarget(input: { clientId: string; mediaChannelId: string }): Promise<number> {
    const guideline = await this.tx.guideline.findFirst({
      where: { clientId: input.clientId, mediaChannelId: input.mediaChannelId, active: true },
    });
    if (!guideline) {
      throw new GuidelineNotConfiguredError(input.clientId, input.mediaChannelId);
    }
    return guideline.targetCount;
  }

  async findDuplicateProcess(input: {
    combinationId: string;
    piNumber: string;
    analysisDate: Date;
  }): Promise<{ id: string } | null> {
    const found = await this.tx.analyzedProcess.findFirst({
      where: {
        combinationId: input.combinationId,
        piNumber: input.piNumber,
        analysisDate: input.analysisDate,
      },
      select: { id: true },
    });
    return found;
  }

  async findProcessByPiNumber(input: { combinationId: string; piNumber: string }): Promise<{ id: string } | null> {
    const found = await this.tx.analyzedProcess.findFirst({
      where: { combinationId: input.combinationId, piNumber: input.piNumber },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return found;
  }

  async createProcess(input: CreateProcessInput): Promise<{ id: string }> {
    const created = await this.tx.analyzedProcess.create({
      data: {
        combinationId: input.combinationId,
        piNumber: input.piNumber,
        analysisDate: input.analysisDate,
        result: input.result,
        observation: input.observation,
        recordedByUserId: input.recordedByUserId,
      },
      select: { id: true },
    });
    return created;
  }

  async createReturn(input: CreateReturnInput): Promise<{ id: string }> {
    const created = await this.tx.reanalysisReturn.create({
      data: {
        combinationId: input.combinationId,
        piNumber: input.piNumber,
        processId: input.processId,
        reason: input.reason,
        observation: input.observation,
        occurredAt: input.occurredAt,
        registeredByUserId: input.registeredByUserId,
        contextState: input.contextState,
        monthKey: input.monthKey,
      },
      select: { id: true },
    });
    return created;
  }

  async saveStateAndEvents(input: SaveStateAndEventsInput): Promise<void> {
    const { state, events } = input;
    await this.tx.analystClientMedia.update({
      where: { id: input.combinationId },
      data: {
        status: state.status,
        constructionCount: state.constructionCount,
        monthlyReturnCount: state.monthlyReturnCount,
        monthlyReturnMonthKey: state.monthlyReturnMonthKey,
        releasedAt: state.releasedAt,
        lastReturnAt: state.lastReturnAt,
        lastReturnReason: state.lastReturnReason,
        lastMovementAt: new Date(),
      },
    });
    if (events.length > 0) {
      await this.tx.reanalysisEvent.createMany({
        data: events.map((event) => ({
          combinationId: input.combinationId,
          type: event.type,
          occurredAt: event.at,
          detail: event.detail as Prisma.InputJsonValue,
          performedByUserId: input.performedByUserId,
        })),
      });
    }
  }
}

@Injectable()
export class PrismaReleaseUnitOfWork implements ReleaseUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async runInTransaction<T>(work: (repo: ReleaseRepositoryPort) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new TxReleaseRepository(tx)));
  }
}
