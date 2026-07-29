/* ==========================================================================
   app.js — orquestração das etapas
   --------------------------------------------------------------------------
   abertura → coleta (chat OU formulário) → contato → resultado

   Duas decisões de desenho que estão inteiras neste arquivo:

   1. O CAMINHO DETERMINÍSTICO É O CHÃO, não o extra. Se o chat falhar por
      qualquer motivo — webhook fora, rede ruim, teto de turnos — a página cai
      no formulário e continua funcionando. A IA é conforto, não requisito.
   2. O CONTATO É PORTÃO, mas o portão nunca prende. Depois que a pessoa
      entrega os dados, o resultado aparece mesmo que o registro do lead falhe
      (ver lead.js). Falha nossa não é problema de quem converteu.
   ========================================================================== */

import { diagnosticar } from './calculo.js';
import { estadoVazio, faltando, mesclar, turno } from './chat.js';
import { EM_VALIDACAO } from './endpoints.js';
import { lerContato, lerDadosFiscais, mascararTelefone } from './formulario.js';
import { enviarLead, montarPayload, reenviarPendentes } from './lead.js';
import { renderResultado } from './resultado.js';

const $ = (sel) => document.querySelector(sel);

const estado = {
  modo: null,               /* 'chat' | 'formulario' */
  dados: estadoVazio(),
  historico: [],
  contato: null,
  consentTexto: '',         /* literal, guardado para o reenvio da correção */
  diagnostico: null,
  /* Identidade do lead, estável para a MESMA pessoa nesta visita. Corrigir os
     números reaproveita este id, e o `appendOrUpdate` do n8n atualiza a linha
     em vez de criar outra. "Começar do zero" recarrega a página, e um id novo
     nasce junto — que é o certo, porque aí é outro produtor. */
  eventId: null,
  payload: null,            /* remontado a cada correção; ver `finalizar` */
  enviando: false,
};

const ETAPAS = ['abertura', 'chat', 'form', 'contato', 'resultado'];

function irPara(etapa) {
  for (const nome of ETAPAS) {
    const secao = $(`#etapa-${nome}`);
    if (secao) secao.hidden = nome !== etapa;
  }
  /* Foco no título da etapa: sem isso, quem navega por teclado ou leitor de
     tela continua no fim da etapa anterior e não percebe que a página mudou. */
  const titulo = $(`#etapa-${etapa} [data-foco]`);
  if (titulo) titulo.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Conversa ─────────────────────────────────────────────────────────────── */

const SAUDACAO = 'Oi! Vou montar com você uma estimativa do que a Reforma '
  + 'Tributária representa na sua atividade rural. São quatro perguntas. '
  + 'Para começar: qual foi a sua receita bruta no último ano?';

function bolha(quem, texto) {
  const div = document.createElement('div');
  div.className = `bolha bolha--${quem}`;
  div.textContent = texto;
  $('#transcricao').append(div);
  $('#transcricao').scrollTop = $('#transcricao').scrollHeight;
  return div;
}

function atualizarProgresso() {
  const faltam = faltando(estado.dados).length;
  $('#chat-progresso').textContent = faltam === 0
    ? 'Tudo anotado.'
    : `Faltam ${faltam} de 4 informações.`;
}

function digitando(ligado) {
  $('#chat-digitando').hidden = !ligado;
  $('#form-chat button').disabled = ligado;
  $('#msg').disabled = ligado;
  if (!ligado) $('#msg').focus();
}

/* Quanto tempo se espera pelo assistente antes de desistir dele.

   ⚠️ Sem isto a degradação abaixo NUNCA dispara no pior caso. `turno` cai no
   catch quando a chamada FALHA — mas conexão pendurada não falha: o navegador
   espera minutos antes de desistir sozinho, e nesse tempo a pessoa só vê
   "digitando…", sem erro, sem formulário, sem saída. Foi exatamente o que
   aconteceu com o n8n fora do ar: o fallback existia e ficou inerte.
   Prazo estourado é tratado como qualquer outro erro — cai para o formulário. */
const PRAZO_CHAT_MS = 20_000;

function prazoDe(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { sinal: ctrl.signal, cancelar: () => clearTimeout(timer) };
}

/* Degrada para o formulário sem perder o que já foi coletado. */
function cairParaFormulario(motivo) {
  console.warn('[chat] degradando para formulário:', motivo);
  $('#aviso-degradacao').hidden = false;
  if (estado.dados.receitas !== null) $('#receitas').value = estado.dados.receitas;
  if (estado.dados.despesas !== null) $('#despesas').value = estado.dados.despesas;
  estado.modo = 'formulario';
  irPara('form');
}

async function enviarMensagem(evento) {
  evento.preventDefault();
  const texto = $('#msg').value.trim();
  if (!texto) return;

  bolha('pessoa', texto);
  estado.historico.push({ role: 'user', content: texto });
  $('#msg').value = '';
  digitando(true);

  const prazo = prazoDe(PRAZO_CHAT_MS);
  try {
    const r = await turno(estado.historico, { sinal: prazo.sinal });
    estado.historico.push({ role: 'assistant', content: r.fala });
    estado.dados = mesclar(estado.dados, r.campos);
    bolha('assistente', r.fala);
    atualizarProgresso();

    /* A decisão de avançar é NOSSA, não do modelo: só passa quando os quatro
       campos existem de fato. `completo: true` com campo faltando seria uma
       alucinação levando a pessoa a uma tela de resultado sem resultado. */
    if (faltando(estado.dados).length === 0) {
      setTimeout(() => irPara('contato'), 700);
    }
  } catch (erro) {
    bolha('assistente', 'Tive um problema para continuar por aqui. '
      + 'Sem drama — dá para preencher direto, é rápido.');
    setTimeout(() => cairParaFormulario(erro.message), 900);
  } finally {
    prazo.cancelar();
    digitando(false);
  }
}

function iniciarChat() {
  estado.modo = 'chat';
  /* Saudação enlatada de propósito: primeira tela sem espera e sem custo de
     token. A IA entra só quando tem o que interpretar. */
  if (!estado.historico.length) {
    bolha('assistente', SAUDACAO);
    estado.historico.push({ role: 'assistant', content: SAUDACAO });
  }
  atualizarProgresso();
  irPara('chat');
  $('#msg').focus();
}

/* ── Resultado ────────────────────────────────────────────────────────────── */

/* Calcula, mostra e registra. Vive separado de `concluir` porque há DOIS
   caminhos até aqui: a primeira passagem (que vem da etapa de contato) e a
   correção de números (que pula o contato, porque a pessoa já entregou os dados
   e já consentiu — pedir de novo seria atrito numa tela que ela já venceu). */
async function finalizar(botao) {
  if (estado.enviando) return;
  estado.enviando = true;
  const rotulo = botao ? botao.textContent : '';
  if (botao) {
    botao.textContent = 'Calculando…';
    botao.disabled = true;
  }

  estado.diagnostico = diagnosticar(estado.dados);
  renderResultado(estado.diagnostico, { nome: estado.contato.nome });
  irPara('resultado');

  /* Depois de mostrar, nunca antes. O registro do lead é assunto nosso.

     O `event_id` nasce uma vez e sobrevive às correções: é ele que faz o n8n
     ATUALIZAR a linha da planilha em vez de acrescentar outra. O payload, ao
     contrário, é remontado sempre — senão a correção mostraria números novos na
     tela e mandaria os velhos para a planilha. */
  estado.eventId = estado.eventId || crypto.randomUUID();
  estado.payload = montarPayload({
    contato: estado.contato,
    diagnostico: estado.diagnostico,
    origem: `calculadora-${estado.modo || 'direto'}`,
    cta: 'ver-meu-resultado',
    consentTexto: estado.consentTexto,
    eventId: estado.eventId,
  });

  const entrou = await enviarLead(estado.payload);
  if (!entrou) {
    /* Não é erro para a pessoa — é sinal para nós. O lead está na fila. */
    console.warn('[lead] na fila local; será reenviado no próximo acesso.');
  }

  if (botao) {
    botao.textContent = rotulo;
    botao.disabled = false;
  }
  estado.enviando = false;
}

async function concluir(evento) {
  evento.preventDefault();
  if (estado.enviando) return;

  const { ok, dados, consentTexto } = lerContato($('#form-contato'));
  if (!ok) {
    $('#form-contato [aria-invalid="true"]')?.focus();
    return;
  }

  estado.contato = dados;
  /* Literal, como manda `padrao-dados-pessoais.md`: é o que prova o que a
     pessoa leu. Guardado porque a correção reenvia sem passar por esta tela. */
  estado.consentTexto = consentTexto;

  await finalizar($('#form-contato button[type="submit"]'));
}

/* ── Ligações ─────────────────────────────────────────────────────────────── */

function ligar() {
  $('#porta-chat').addEventListener('click', iniciarChat);
  $('#porta-formulario').addEventListener('click', () => {
    estado.modo = 'formulario';
    irPara('form');
  });
  $('#prefiro-formulario').addEventListener('click', () => cairParaFormulario('escolha da pessoa'));

  $('#form-chat').addEventListener('submit', enviarMensagem);

  $('#form-fiscal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, dados } = lerDadosFiscais($('#form-fiscal'));
    if (!ok) {
      $('#form-fiscal [aria-invalid="true"]')?.focus();
      return;
    }
    estado.dados = { ...estado.dados, ...dados };
    /* Quem já deu o contato está CORRIGINDO, não começando: vai direto ao
       resultado. Passar pela tela de contato de novo pediria um consentimento
       que já foi dado e mudaria o texto consentido sem motivo. */
    if (estado.contato) {
      await finalizar($('#form-fiscal button[type="submit"]'));
      return;
    }
    irPara('contato');
  });

  $('#form-contato').addEventListener('submit', concluir);
  $('#voltar-dados').addEventListener('click', () => {
    /* Etapa de contato: o lead ainda NÃO foi enviado, então não há linha na
       planilha para atualizar nem `event_id` a preservar. */
    estado.payload = null;
    irPara(estado.modo === 'chat' ? 'chat' : 'form');
  });

  /* Corrigir: mesma pessoa, números errados. Volta para a coleta com o contato
     e o `event_id` intactos — o reenvio sobrescreve a linha da planilha. */
  $('#corrigir-numeros').addEventListener('click', () => {
    estado.payload = null;
    if (estado.dados.receitas !== null) $('#receitas').value = estado.dados.receitas;
    if (estado.dados.despesas !== null) $('#despesas').value = estado.dados.despesas;
    /* A correção sempre cai no formulário, mesmo para quem veio do chat:
       reabrir a conversa para trocar um número é mais caminho do que corrigir
       um campo, e o histórico já ficou com o valor errado. */
    estado.modo = estado.modo === 'chat' ? 'chat' : 'formulario';
    irPara('form');
  });

  /* Começar do zero: outro produtor. Recarregar é o reset honesto — limpa
     conversa, campos, estado e DOM de uma vez, e o `event_id` novo garante
     linha nova na planilha. A fila local de leads pendentes sobrevive
     (localStorage) e é reenviada no load. */
  $('#recomecar').addEventListener('click', () => { window.location.reload(); });

  mascararTelefone($('#whatsapp'));

  /* No host de validação o chat não dispara chamada real — esconder a porta é
     mais honesto que deixá-la quebrar na cara de quem está aprovando o design. */
  if (EM_VALIDACAO) {
    $('#porta-chat').hidden = true;
    $('#aviso-validacao').hidden = false;
  }

  reenviarPendentes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ligar);
} else {
  ligar();
}
