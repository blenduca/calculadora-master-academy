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
  diagnostico: null,
  payload: null,            /* montado uma vez; ver `concluir` */
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

  try {
    const r = await turno(estado.historico);
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

async function concluir(evento) {
  evento.preventDefault();
  if (estado.enviando) return;

  const { ok, dados, consentTexto } = lerContato($('#form-contato'));
  if (!ok) {
    $('#form-contato [aria-invalid="true"]')?.focus();
    return;
  }

  estado.enviando = true;
  const botao = $('#form-contato button[type="submit"]');
  const rotulo = botao.textContent;
  botao.textContent = 'Calculando…';
  botao.disabled = true;

  estado.contato = dados;
  estado.diagnostico = diagnosticar(estado.dados);

  renderResultado(estado.diagnostico, { nome: dados.nome });
  irPara('resultado');

  /* Depois de mostrar, nunca antes. O registro do lead é assunto nosso.

     O payload é montado UMA vez e guardado. `montarPayload` gera um `event_id`
     novo a cada chamada, então remontá-lo num segundo envio criaria uma
     segunda linha na planilha para o mesmo diagnóstico — a deduplicação por
     `event_id` só funciona se o id for estável. Volta e alteração de números
     zeram o payload (ver `#voltar-dados`). */
  if (!estado.payload) {
    estado.payload = montarPayload({
      contato: dados,
      diagnostico: estado.diagnostico,
      origem: `calculadora-${estado.modo || 'direto'}`,
      cta: 'ver-meu-resultado',
      consentTexto,
    });
  }
  const entrou = await enviarLead(estado.payload);
  if (!entrou) {
    /* Não é erro para a pessoa — é sinal para nós. O lead está na fila. */
    console.warn('[lead] na fila local; será reenviado no próximo acesso.');
  }

  botao.textContent = rotulo;
  botao.disabled = false;
  estado.enviando = false;
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

  $('#form-fiscal').addEventListener('submit', (e) => {
    e.preventDefault();
    const { ok, dados } = lerDadosFiscais($('#form-fiscal'));
    if (!ok) {
      $('#form-fiscal [aria-invalid="true"]')?.focus();
      return;
    }
    estado.dados = { ...estado.dados, ...dados };
    irPara('contato');
  });

  $('#form-contato').addEventListener('submit', concluir);
  $('#voltar-dados').addEventListener('click', () => {
    /* Números podem mudar a partir daqui — o payload guardado deixa de valer. */
    estado.payload = null;
    irPara(estado.modo === 'chat' ? 'chat' : 'form');
  });

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
