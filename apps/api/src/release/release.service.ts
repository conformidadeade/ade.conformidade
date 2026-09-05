import { Inject, Injectable } from "@nestjs/common";
import {
  applyCorrectProcess,
  applyManualReset,
  applyManualReturn,
  applyReturn,
  DomainEvent,
  monthKeyOf,
} from "@reanalise-erp/release-engine";
import { CombinationStatus } from "@reanalise-erp/types";
import { DuplicateProcessError } from "./errors";
import { RELEASE_UOW, ReleaseUnitOfWork } from "./release-repository.port";

export interface RegisterProcessInput {
  analystId: string;
  clientId: string;
  mediaChannelId: string;
  piNumber: string;
  analysisDate: Date;
  /** Omitido pela tela de Lançamento (adendo Fase 2, item 2) — default CORRETO. */
  result?: "CORRETO" | "INCORRETO";
  observation?: string;
  recordedByUserId: string;
  /** Confirma explicitamente que a duplicidade de PI é um reprocessamento legítimo (item 23). */
  allowDuplicate?: boolean;
}

export interface RegisterReturnInput {
  analystId: string;
  clientId: string;
  mediaChannelId: string;
  /** Nº do PI devolvido — texto livre, sempre aceito (adendo Fase 2, item 1). */
  piNumber: string;
  reason: string;
  observation?: string;
  occurredAt: Date;
  registeredByUserId: string;
}

export interface ManualActionInput {
  analystId: string;
  clientId: string;
  mediaChannelId: string;
  reason: string;
  occurredAt: Date;
  performedByUserId: string;
}

export interface ReleaseActionResult {
  combinationId: string;
  status: CombinationStatus;
  events: DomainEvent[];
}

/**
 * Orquestra as regras de release-engine em cima da persistência (via
 * ReleaseUnitOfWork), garantindo que cada ação do usuário — lançar
 * processo, registrar devolução, resetar ou retornar manualmente — é uma
 * única transação atômica que atualiza processo/devolução, estado da
 * combinação e histórico de eventos de uma vez (item 25: fonte única de
 * verdade, nenhuma duplicidade de lançamento entre telas).
 */
@Injectable()
export class ReleaseService {
  constructor(@Inject(RELEASE_UOW) private readonly uow: ReleaseUnitOfWork) {}

  async registerProcess(input: RegisterProcessInput): Promise<ReleaseActionResult> {
    return this.uow.runInTransaction(async (repo) => {
      const combination = await repo.findOrCreateCombination(input);

      if (input.result === "INCORRETO") {
        // Um processo incorreto identificado na reanálise não é, por si só,
        // uma "devolução" (essa é uma ação distinta, registrada na tela do
        // item 15, tipicamente quando o erro é achado depois do envio de
        // uma combinação já liberada). Aqui só registramos o processo.
        await repo.createProcess({
          combinationId: combination.id,
          piNumber: input.piNumber,
          analysisDate: input.analysisDate,
          result: "INCORRETO",
          observation: input.observation,
          recordedByUserId: input.recordedByUserId,
        });
        return { combinationId: combination.id, status: combination.state.status, events: [] };
      }

      const duplicate = await repo.findDuplicateProcess({
        combinationId: combination.id,
        piNumber: input.piNumber,
        analysisDate: input.analysisDate,
      });
      if (duplicate && !input.allowDuplicate) {
        throw new DuplicateProcessError(duplicate.id);
      }

      const guidelineTarget = await repo.getCurrentGuidelineTarget(input);
      const { state, events } = applyCorrectProcess(combination.state, {
        guidelineTarget,
        at: input.analysisDate,
      });

      await repo.createProcess({
        combinationId: combination.id,
        piNumber: input.piNumber,
        analysisDate: input.analysisDate,
        result: "CORRETO",
        observation: input.observation,
        recordedByUserId: input.recordedByUserId,
      });
      await repo.saveStateAndEvents({
        combinationId: combination.id,
        state,
        events,
        performedByUserId: input.recordedByUserId,
      });

      return { combinationId: combination.id, status: state.status, events };
    });
  }

  async registerReturn(input: RegisterReturnInput): Promise<ReleaseActionResult> {
    return this.uow.runInTransaction(async (repo) => {
      const combination = await repo.getCombination(input);
      const contextState = combination.state.status;
      const monthKey = monthKeyOf(input.occurredAt);

      const { state, events } = applyReturn(combination.state, {
        at: input.occurredAt,
        reason: input.reason,
      });

      // Vínculo automático e silencioso (item 1): a maioria das devoluções
      // de combinações já LIBERADAS não tem processo correspondente no
      // sistema (o PI nunca passou pela reanálise) — não encontrar não é
      // erro, só resulta em processId=null.
      const matchingProcess = await repo.findProcessByPiNumber({
        combinationId: combination.id,
        piNumber: input.piNumber,
      });

      await repo.createReturn({
        combinationId: combination.id,
        piNumber: input.piNumber,
        processId: matchingProcess?.id,
        reason: input.reason,
        observation: input.observation,
        occurredAt: input.occurredAt,
        registeredByUserId: input.registeredByUserId,
        contextState,
        monthKey,
      });
      await repo.saveStateAndEvents({
        combinationId: combination.id,
        state,
        events,
        performedByUserId: input.registeredByUserId,
      });

      return { combinationId: combination.id, status: state.status, events };
    });
  }

  async manualReset(input: ManualActionInput): Promise<ReleaseActionResult> {
    return this.uow.runInTransaction(async (repo) => {
      const combination = await repo.getCombination(input);
      const { state, events } = applyManualReset(combination.state, {
        at: input.occurredAt,
        reason: input.reason,
        performedByUserId: input.performedByUserId,
      });
      await repo.saveStateAndEvents({
        combinationId: combination.id,
        state,
        events,
        performedByUserId: input.performedByUserId,
      });
      return { combinationId: combination.id, status: state.status, events };
    });
  }

  async manualReturn(input: ManualActionInput): Promise<ReleaseActionResult> {
    return this.uow.runInTransaction(async (repo) => {
      const combination = await repo.getCombination(input);
      const { state, events } = applyManualReturn(combination.state, {
        at: input.occurredAt,
        reason: input.reason,
        performedByUserId: input.performedByUserId,
      });
      await repo.saveStateAndEvents({
        combinationId: combination.id,
        state,
        events,
        performedByUserId: input.performedByUserId,
      });
      return { combinationId: combination.id, status: state.status, events };
    });
  }
}
