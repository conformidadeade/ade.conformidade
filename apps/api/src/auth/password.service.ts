import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /** Token opaco de alta entropia para refresh token — não precisa de argon2 (não é senha humana). */
  generateOpaqueToken(): string {
    return randomBytes(48).toString("hex");
  }

  hashOpaqueToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
