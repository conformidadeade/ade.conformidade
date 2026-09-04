import { UserRole } from "@reanalise-erp/types";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  analystId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  analystId: string | null;
}
