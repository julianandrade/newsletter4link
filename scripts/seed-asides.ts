/**
 * A starter set of candidates for the closing "one more thing" slot.
 *
 * Written 8 August 2026 by Claude, while Julian was away, and seeded as PENDING / MODEL
 * rather than APPROVED. That is not caution for its own sake: it is the design's own rule,
 * recorded in docs/superpowers/specs/2026-08-08-one-more-thing-design.md. Nothing a model
 * wrote may reach a send without a person moving it to APPROVED, and `asidePickerQuery`
 * only ever offers APPROVED rows, so none of these can go out by accident.
 *
 * The themes are the ones Julian named: before ChatGPT versus now versus whatever is next,
 * agentic everything, slop, and the specific comedy of a senior engineer reviewing a diff
 * no human wrote.
 *
 * Run with:
 *   node --env-file=.env scripts/seed-asides.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// The same adapter lib/db.ts builds. Prisma 7 refuses a client with no options, and this
// script cannot import lib/db.ts directly: Node's ESM resolver does not do directory
// imports, which is why every other script here is run some other way.
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
  log: ["error"],
});

const CANDIDATES = [
  "Antes do ChatGPT líamos a documentação. Agora perguntamos ao modelo, que a leu por nós e inventou a parte que faltava.",
  "Revi um pull request de quatro mil linhas que nenhum humano escreveu. Aprovei em nove minutos. Os dois demos o nosso melhor.",
  "Agêntico: adjetivo que transforma um cron job numa ronda de investimento.",
  "A estimativa era de três semanas. Com IA passou a três semanas, mas com mais slides.",
  "Já não escrevemos código. Escrevemos prompts, revemos código, e depois escrevemos o código.",
  "O modelo alucinou uma função que não existia. Implementei-a. Agora existe.",
  "Consultoria em IA: um terço a explicar o que a IA faz, um terço a explicar o que não faz, e o resto a fazê-lo.",
  "Slop é o nome que damos ao conteúdo gerado pelos outros.",
  "Pediram-me para automatizar o meu trabalho. Automatizei a parte de dizer que sim.",
  "Temos um copiloto, um agente e um assistente. Ninguém sabe qual deles fez o deploy de sexta-feira.",
  "O cliente pediu uma prova de conceito de GenAI. Não disse para quê. Entregámos, e ficou satisfeito por também não ter percebido.",
  "A IA não te tira o emprego. Tira-o quem souber pedir-lhe as coisas melhor do que tu, e essa pessoa também está a usar IA.",
];

async function main() {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true },
  });

  if (organizations.length === 0) {
    console.error("No organizations found. Nothing to seed.");
    return;
  }

  for (const organization of organizations) {
    const existing = await prisma.aside.count({
      where: { organizationId: organization.id },
    });

    if (existing > 0) {
      console.log(
        `${organization.name}: ${existing} asides already exist, skipping rather than duplicating.`
      );
      continue;
    }

    const created = await prisma.aside.createMany({
      data: CANDIDATES.map((text) => ({
        text,
        kind: "JOKE" as const,
        // The whole point. A person approves these, or they never go anywhere.
        status: "PENDING" as const,
        source: "MODEL" as const,
        language: "pt-PT",
        reusable: true,
        organizationId: organization.id,
      })),
    });

    console.log(`${organization.name}: ${created.count} candidates queued for approval.`);
  }

  const pending = await prisma.aside.count({ where: { status: "PENDING" } });
  const approved = await prisma.aside.count({ where: { status: "APPROVED" } });
  console.log(`\nTotal: ${pending} pending, ${approved} approved.`);
  console.log("Approve what you like at /dashboard/asides. Nothing sends until you do.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
