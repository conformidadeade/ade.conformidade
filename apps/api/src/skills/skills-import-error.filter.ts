import { ArgumentsHost, Catch, ExceptionFilter, UnprocessableEntityException } from "@nestjs/common";
import { Response } from "express";
import { SkillsImportValidationError } from "./errors";

/** Traduz falha de validação da planilha (item 6.3) para 422 com o relatório linha a linha. */
@Catch(SkillsImportValidationError)
export class SkillsImportErrorFilter implements ExceptionFilter {
  catch(error: SkillsImportValidationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = new UnprocessableEntityException({ message: error.message, errors: error.errors }).getResponse();
    res.status(422).json(body);
  }
}
