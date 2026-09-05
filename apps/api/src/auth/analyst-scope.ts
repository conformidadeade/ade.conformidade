import { AuthenticatedUser } from "./jwt-payload";

/**
 * UUID que nunca corresponde a um Analyst real (todos são gerados via
 * uuid v4 aleatório) — usado para forçar zero resultados quando um
 * ANALISTA ainda não está vinculado a um cadastro de Analyst (item 2 do
 * adendo "Acesso restrito e autosserviço"). Preferível a filtrar por
 * `null`, que os tipos do Prisma nem aceitam para uma coluna obrigatória.
 */
export const UNLINKED_ANALYST_SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * Autorização por linha (item 1 do adendo): para o perfil ANALISTA, o
 * analystId de uma consulta é SEMPRE o do próprio usuário autenticado —
 * qualquer valor recebido via query/body é silenciosamente ignorado e
 * sobrescrito, nunca gera erro. LIDERANCA/ADMINISTRADOR não são afetados
 * (o valor recebido passa direto, inclusive `undefined` = sem filtro).
 */
export function scopeAnalystId(user: AuthenticatedUser, requested: string | undefined): string | undefined {
  if (user.role !== "ANALISTA") return requested;
  return user.analystId ?? UNLINKED_ANALYST_SENTINEL;
}
