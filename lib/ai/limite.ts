import { criarLimitador } from '@/lib/seguranca';

/** Limite das rotas de IA (por IP). RATE_LIMIT_PER_MIN (padrão 20). Em memória: ver criarLimitador. */
const porMin = Number(process.env.RATE_LIMIT_PER_MIN);
export const limiteIA = criarLimitador({ limite: Number.isFinite(porMin) && porMin > 0 ? porMin : 20, janelaMs: 60_000 });
