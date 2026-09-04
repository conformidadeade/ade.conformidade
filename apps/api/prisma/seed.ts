/**
 * Seed mínimo: garante que exista pelo menos um usuário ADMINISTRADOR para
 * o primeiro login. Não semeia Clientes/Meios/Analistas de exemplo — o
 * requisito é explícito (item 32) que o sistema é genérico e esses são só
 * exemplos; cada organização cadastra os seus pela interface.
 *
 * Credenciais via env (ADMIN_EMAIL/ADMIN_PASSWORD) com um fallback óbvio
 * para ambiente de desenvolvimento — troque a senha no primeiro login.
 */
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@reanalise.local";
  const password = process.env.ADMIN_PASSWORD ?? "troque-esta-senha-123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuário administrador já existe (${email}) — nada a fazer.`);
    return;
  }

  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: {
      name: "Administrador",
      email,
      passwordHash,
      role: "ADMINISTRADOR",
    },
  });

  console.log(`Usuário administrador criado: ${email} / ${password} — troque a senha no primeiro login.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
