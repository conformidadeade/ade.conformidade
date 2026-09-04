import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  test("hash/verify: senha correta valida, senha errada não", async () => {
    const hash = await service.hash("senha-correta-123");
    await expect(service.verify(hash, "senha-correta-123")).resolves.toBe(true);
    await expect(service.verify(hash, "senha-errada")).resolves.toBe(false);
  });

  test("hashOpaqueToken é determinístico (mesmo token → mesmo hash, comparável em busca)", () => {
    const token = service.generateOpaqueToken();
    expect(service.hashOpaqueToken(token)).toBe(service.hashOpaqueToken(token));
  });

  test("tokens opacos gerados são únicos", () => {
    const a = service.generateOpaqueToken();
    const b = service.generateOpaqueToken();
    expect(a).not.toBe(b);
  });
});
