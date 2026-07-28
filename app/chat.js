/* ==========================================================================
   chat.js — a camada de conversa
   --------------------------------------------------------------------------
   O que ela faz: transforma fala em quatro números.
   O que ela NÃO faz: conta. Nunca. O resultado sai inteiro de calculo.js.

   O modelo devolve JSON validado por schema (`output_config.format` no fluxo
   n8n), não texto para regex. O protótipo original pedia ao modelo que
   escrevesse tags `[DADOS]...` no meio da resposta e as extraía com expressão
   regular — frágil por construção: basta o modelo escrever a tag em outro
   formato uma vez e a coleta some sem erro nenhum.

   A chave da Anthropic não passa por aqui. Ver endpoints.js.
   ========================================================================== */

import { CHAT_WEBHOOK, EM_VALIDACAO } from './endpoints.js';

/* Teto de turnos. Serve para dois problemas ao mesmo tempo: uma conversa que
   não converge nunca (a pessoa se perde e desiste) e um proxy público de LLM
   sendo usado como brinquedo por conta da Master. */
export const MAX_TURNOS = 14;

/* Campos que a conversa tem que arrancar. A ordem importa: é a ordem em que o
   assistente pergunta quando precisa escolher. */
export const CAMPOS = ['receitas', 'despesas', 'cooperativa', 'contribuinte'];

export function estadoVazio() {
  return { receitas: null, despesas: null, cooperativa: null, contribuinte: null };
}

export function faltando(estado) {
  return CAMPOS.filter((c) => estado[c] === null || estado[c] === undefined);
}

/* Só sobrescreve com valor de verdade. `null` do modelo significa "ainda não
   sei", e não pode apagar algo que a pessoa já respondeu três turnos atrás. */
export function mesclar(estado, campos) {
  const novo = { ...estado };
  if (!campos || typeof campos !== 'object') return novo;
  for (const c of CAMPOS) {
    const v = campos[c];
    if (v === null || v === undefined) continue;
    if (c === 'receitas' || c === 'despesas') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) novo[c] = n;
    } else if (typeof v === 'boolean') {
      novo[c] = v;
    }
  }
  return novo;
}

class ErroDeChat extends Error {
  constructor(mensagem, causa) {
    super(mensagem);
    this.name = 'ErroDeChat';
    this.causa = causa;
  }
}

/* Um turno. Lança em qualquer falha — quem chama (app.js) trata a exceção
   caindo para o formulário direto. Degradar é melhor que travar: o caminho
   determinístico faz o mesmo trabalho sem depender de rede nem de token. */
export async function turno(historico, { sinal } = {}) {
  if (EM_VALIDACAO) {
    throw new ErroDeChat('Host de validação: o chat não dispara chamada real.');
  }
  if (historico.length > MAX_TURNOS * 2) {
    throw new ErroDeChat('Conversa longa demais.');
  }

  let resposta;
  try {
    resposta = await fetch(CHAT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historico }),
      signal: sinal,
    });
  } catch (erro) {
    throw new ErroDeChat('Não consegui falar com o assistente.', erro);
  }

  if (!resposta.ok) {
    throw new ErroDeChat(`Assistente respondeu ${resposta.status}.`);
  }

  let corpo;
  try {
    corpo = await resposta.json();
  } catch (erro) {
    throw new ErroDeChat('Resposta do assistente veio ilegível.', erro);
  }

  /* O schema é garantido do lado do n8n, mas confiar em contrato sem conferir
     é como não ter contrato: uma alteração no fluxo chegaria aqui como
     `undefined` renderizado na tela. */
  if (!corpo || typeof corpo.fala !== 'string' || !corpo.fala.trim()) {
    throw new ErroDeChat('Resposta do assistente veio sem conteúdo.');
  }

  return {
    fala: corpo.fala.trim(),
    campos: corpo.campos || {},
    completo: Boolean(corpo.completo),
  };
}
