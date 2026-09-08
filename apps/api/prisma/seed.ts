/**
 * Seed mínimo: garante que exista pelo menos um usuário ADMINISTRADOR para
 * o primeiro login. Não semeia Clientes/Meios/Analistas/Diretrizes/etc. de
 * exemplo — o requisito é explícito (item 32) que o sistema é genérico e
 * esses são só exemplos; cada organização cadastra os seus pela interface.
 * Isso vale tanto para produção (adendo "Deploy limpo") quanto para um
 * banco local novo — nenhum dado de negócio de exemplo em nenhum dos dois.
 *
 * Credenciais: ADMIN_EMAIL/ADMIN_PASSWORD via env, se quiser fixar. Sem
 * ADMIN_PASSWORD definido, é gerada uma senha temporária forte e aleatória
 * (nunca um valor previsível fixo no código — adendo "Deploy limpo") e
 * impressa UMA VEZ no terminal: anote-a, ela não fica salva em nenhum
 * lugar recuperável depois. Troque-a no primeiro login (ver README —
 * ainda não existe uma tela de "trocar senha no primeiro acesso"; use a
 * tela Usuários > Editar > "Nova senha", já com esse propósito).
 *
 * Idempotente: se o e-mail já existir (ex.: já rodou antes neste banco),
 * não faz nada — não sobrescreve uma senha já trocada.
 */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

/** Senha temporária forte: alto-entropia, sem depender de um valor fixo no código. */
function generateStrongPassword(): string {
  return randomBytes(18).toString("base64url"); // 24 chars, [A-Za-z0-9_-]
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@reanalise.local";
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? generateStrongPassword();

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

  console.log("");
  console.log("========================================================");
  console.log(" Usuário administrador criado:");
  console.log(`   E-mail: ${email}`);
  console.log(`   Senha${generated ? " (gerada automaticamente)" : ""}: ${password}`);
  console.log(" Anote agora — não é possível recuperar esta senha depois.");
  console.log(" Troque-a no primeiro acesso em Usuários > Editar > Nova senha.");
  console.log("========================================================");
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
