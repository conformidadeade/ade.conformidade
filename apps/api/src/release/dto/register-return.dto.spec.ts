import { randomUUID } from "crypto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterReturnDto } from "./register-return.dto";

/**
 * Valida o DTO isoladamente com a mesma pipeline do ValidationPipe global
 * (whitelist + transform, ver main.ts) — cobre o item 5 do adendo "Origem
 * da devolução": tentar registrar sem selecionar origem é bloqueado.
 */
describe("RegisterReturnDto — origem da devolução (adendo 08/09/2026)", () => {
  const basePayload = {
    analystId: randomUUID(),
    clientId: randomUUID(),
    mediaChannelId: randomUUID(),
    piNumber: "PI-1",
    reason: "motivo",
    occurredAt: "2026-01-10",
  };

  test("sem 'origin' → bloqueado, campo obrigatório", async () => {
    const dto = plainToInstance(RegisterReturnDto, basePayload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "origin")).toBe(true);
  });

  test.each(["REANALISE", "CLIENTE"])("com origin=%s → válido", async (origin) => {
    const dto = plainToInstance(RegisterReturnDto, { ...basePayload, origin });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  test("origin com valor fora do enum → bloqueado", async () => {
    const dto = plainToInstance(RegisterReturnDto, { ...basePayload, origin: "OUTRO" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "origin")).toBe(true);
  });
});
