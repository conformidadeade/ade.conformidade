export class GuidelineNotConfiguredError extends Error {
  constructor(clientId: string, mediaChannelId: string) {
    super(
      `Não há diretriz configurada para o Cliente ${clientId} + Meio ${mediaChannelId}. Configure uma diretriz antes de lançar processos.`,
    );
    this.name = "GuidelineNotConfiguredError";
  }
}

export class CombinationNotFoundError extends Error {
  constructor(analystId: string, clientId: string, mediaChannelId: string) {
    super(
      `Combinação Analista ${analystId} + Cliente ${clientId} + Meio ${mediaChannelId} não existe. ` +
        "Ela só é criada automaticamente ao lançar o primeiro processo — não é possível registrar uma devolução ou ação manual antes disso.",
    );
    this.name = "CombinationNotFoundError";
  }
}

export class DuplicateProcessError extends Error {
  constructor(public readonly existingProcessId: string) {
    super(
      "Já existe um processo lançado com o mesmo PI, combinação e data de análise. " +
        "Confirme explicitamente (allowDuplicate) se este é um reprocessamento legítimo.",
    );
    this.name = "DuplicateProcessError";
  }
}
