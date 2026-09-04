import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@reanalise-erp/types";

export const ROLES_KEY = "roles";

/**
 * Restringe um handler/controller aos papéis informados (item 21).
 * Sem este decorator, qualquer usuário autenticado passa pelo RolesGuard.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
