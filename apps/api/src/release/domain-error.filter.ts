import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DomainError } from "@reanalise-erp/release-engine";
import { Response } from "express";
import { CombinationNotFoundError, DuplicateProcessError, GuidelineNotConfiguredError } from "./errors";

/**
 * Traduz os erros de domínio (release-engine + camada de orquestração)
 * para respostas HTTP com o motivo explícito — nunca um 500 genérico para
 * uma violação de regra de negócio conhecida.
 */
@Catch(DomainError, GuidelineNotConfiguredError, CombinationNotFoundError, DuplicateProcessError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof GuidelineNotConfiguredError) {
      const body = new UnprocessableEntityException(error.message).getResponse();
      return res.status(422).json(body);
    }
    if (error instanceof CombinationNotFoundError) {
      const body = new NotFoundException(error.message).getResponse();
      return res.status(404).json(body);
    }
    if (error instanceof DuplicateProcessError) {
      const body = new ConflictException({
        message: error.message,
        existingProcessId: error.existingProcessId,
      }).getResponse();
      return res.status(409).json(body);
    }
    // DomainError (transição de estado inválida, ex.: reset manual em LIBERADO)
    const body = new ConflictException(error.message).getResponse();
    return res.status(409).json(body);
  }
}
