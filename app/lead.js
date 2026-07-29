/* ==========================================================================
   lead.js — monta e despacha o lead
   --------------------------------------------------------------------------
   O tratamento de erro aqui é decisão de negócio, e é a correção direta de um
   defeito que existe hoje na LP do evento da Master: lá o POST falha e a tela
   mostra "Inscrição confirmada" mesmo assim — o lead some sem ninguém saber.

   A regra desta ferramenta tem dois lados que não se contradizem:

   1. O RESULTADO SEMPRE APARECE. A pessoa respondeu tudo e deu o contato; não
      é problema dela que o nosso webhook caiu. Bloquear o resultado por falha
      de infraestrutura nossa é punir quem converteu.
   2. O LEAD NUNCA SOME. Se o POST falha, tenta de novo; se falha de novo, vai
      para uma fila em localStorage e é reenviado no próximo carregamento.

   O que NÃO se faz é o que a LP faz hoje: engolir o erro e seguir como se
   tivesse dado certo.
   ========================================================================== */

import { EM_VALIDACAO, LEAD_WEBHOOK } from './endpoints.js';

const FILA = 'ma_leads_pendentes';
const LIMITE_FILA = 20;   /* fila é rede de segurança, não banco de dados */

function lerFila() {
  try {
    const bruto = localStorage.getItem(FILA);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}

function gravarFila(lista) {
  try {
    localStorage.setItem(FILA, JSON.stringify(lista.slice(-LIMITE_FILA)));
  } catch { /* storage bloqueado: não dá para enfileirar, e tudo bem */ }
}

function enfileirar(payload) {
  const lista = lerFila();
  /* `event_id` deduplica: um lead nunca ocupa duas vagas na fila, e o fluxo
     n8n usa a mesma chave para não dobrar a linha na planilha.

     ⚠️ SUBSTITUI, não ignora. Quando a pessoa corrige os números, o payload
     novo reusa o `event_id` de propósito — é o que faz a planilha atualizar a
     linha em vez de criar outra. Se aqui a repetição fosse descartada, o envio
     que falhou com os números ERRADOS ficaria na fila e seria ele o reenviado
     depois: a correção sumiria em silêncio, e só o valor errado chegaria. */
  const jaNaFila = lista.findIndex((p) => p.event_id === payload.event_id);
  if (jaNaFila >= 0) lista[jaNaFila] = payload;
  else lista.push(payload);
  gravarFila(lista);
  console.warn('[lead] enfileirado para reenvio:', payload.event_id);
}

function desenfileirar(eventId) {
  gravarFila(lerFila().filter((p) => p.event_id !== eventId));
}

/* O contrato de captação (`padrao-ativos-web.md`). Campo que não se aplica vai
   como '' em vez de sumir — chave ausente quebra o fluxo n8n a jusante. */
export function montarPayload({
  contato, diagnostico, origem, cta, consentTexto, eventId,
}) {
  const attr = (typeof window.pzAtribuicao === 'function') ? window.pzAtribuicao() : null;
  const plana = (typeof window.pzAtribuicaoPlana === 'function')
    ? window.pzAtribuicaoPlana(attr) : {};

  const meu = diagnostico.quadros.find((q) => q.aplicavel) || {};

  return {
    tenant_slug: 'master-academy',
    ativo_slug: 'calculadora-reforma-tributaria',
    formulario: 'diagnostico',
    origem: origem || '',
    cta: cta || '',

    /* Deduplica quando a mesma conversão chega por dois caminhos.

       Recebido de fora quando a pessoa CORRIGE os números depois de já ter
       visto o resultado: repetindo o `event_id`, o nó `appendOrUpdate` do n8n
       sobrescreve a linha existente na planilha. Duas linhas fariam a Fabiélli
       ligar para o mesmo produtor com dois diagnósticos contraditórios — e a
       primeira, a errada, é a que aparece antes. */
    event_id: eventId || crypto.randomUUID(),
    enviado_em: new Date().toISOString(),

    nome: contato.nome || '',
    email: contato.email || '',
    whatsapp: contato.whatsapp || '',

    /* Honeypot: vai no payload para o n8n descartar do lado de lá. Nunca
       devolver erro para o bot — 4xx ensina que o campo é armadilha. */
    empresa_site: contato.empresa_site || '',

    consentimento: Boolean(contato.consentimento),
    /* Literal, lido do DOM. É o que prova o que a pessoa leu. */
    consent_texto: consentTexto || '',
    consent_ts: contato.consent_ts || '',

    /* O resultado vai junto para a planilha ser útil sem recalcular nada. */
    receitas: diagnostico.entradas.receitas,
    despesas: diagnostico.entradas.despesas,
    cooperativa: diagnostico.entradas.cooperativa,
    contribuinte: diagnostico.entradas.contribuinte,
    quadro: diagnostico.quadro_aplicavel,
    base_calculo: diagnostico.base.base,
    irpf: meu.irpf ?? 0,
    ibscbs: meu.ibscbs ?? 0,
    total: meu.total ?? 0,

    attr,
    ...plana,
  };
}

async function postar(payload) {
  const resposta = await fetch(LEAD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta;
}

/* Devolve `true` se entrou, `false` se ficou na fila. Nunca lança: quem chama
   precisa mostrar o resultado de qualquer jeito. */
export async function enviarLead(payload) {
  if (EM_VALIDACAO) {
    console.info('[lead] host de validação — POST não disparado:', payload);
    return true;
  }
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      await postar(payload);
      desenfileirar(payload.event_id);
      return true;
    } catch (erro) {
      console.warn(`[lead] tentativa ${tentativa} falhou:`, erro.message);
      if (tentativa === 1) await new Promise((r) => setTimeout(r, 900));
    }
  }
  enfileirar(payload);
  return false;
}

/* Chamado no carregamento. Silencioso por design: é manutenção de fila, não
   interação com a pessoa que está na página agora. */
export async function reenviarPendentes() {
  if (EM_VALIDACAO) return;
  for (const payload of lerFila()) {
    try {
      await postar(payload);
      desenfileirar(payload.event_id);
      console.info('[lead] pendente reenviado:', payload.event_id);
    } catch { /* continua pendente; tenta no próximo carregamento */ }
  }
}
