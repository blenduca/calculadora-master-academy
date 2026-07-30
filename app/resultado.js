/* ==========================================================================
   resultado.js — render do diagnóstico
   --------------------------------------------------------------------------
   Render puro: recebe a saída de `diagnosticar()` e escreve na tela. Não faz
   conta, não arredonda, não decide nada. Se um número aqui estiver errado, o
   erro está em calculo.js — e lá tem teste.

   Três regras que a tela não pode violar:
   · O cenário mais barato é marcado por RÓTULO, não só por cor. Escala visual
     sem canal secundário é inacessível.
   · A memória de cálculo fica aberta a um clique. Um número de imposto sem a
     conta atrás é pedir confiança cega — e este é o material que a Master vai
     usar para ganhar confiança.
   · Comparar NÃO é recomendar, e isso ficou MAIS difícil agora que a comparação
     tem lado vencedor. A tela nomeia a diferença e o que a produz; não diz
     "abra um CNPJ". A ressalva final lista o que a conta não mede, porque é
     exatamente o que decide o caso na vida real.
   ========================================================================== */

import {
  ALIQ_IBSCBS_CHEIA, ANO_INICIO_IBSCBS, LIMITE_RECEITA, REDUCAO_AGRO,
} from './calculo.js';
import { renderDedutiveis } from './dedutiveis.js';
import { moedaBR, percentBR } from './formato.js';

const el = (sel, raiz = document) => raiz.querySelector(sel);

/* ── Os dois cartões ──────────────────────────────────────────────────────── */

/* Uma parcela da conta. `detalhe` é o "de onde saiu" — sem ele "IBS/CBS
   R$ 67.200,00" aparece igual nos dois cartões vindo de contas diferentes, e
   quem lê conclui que é a mesma coisa. Não é. */
function parcela(nome, valor, detalhe = '') {
  return `
    <div class="parcela">
      <span class="parcela-nome">${nome}${
        detalhe ? `<small>${detalhe}</small>` : ''
      }</span>
      <span class="parcela-valor">${valor}</span>
    </div>`;
}

/* O selo. Existe nos DOIS cartões, sempre, por duas razões que se somam:

   · Acessibilidade — o cenário mais barato é dito em palavras, não só pelo
     fundo verde. Cor sozinha não é canal.
   · Alinhamento — com selo num cartão só, o cabeçalho do outro fica mais curto
     e os dois totais param em alturas diferentes. Duas colunas que não se
     alinham na linha do total destroem justamente a comparação visual que a
     tela existe para fazer.

   E o selo do perdedor não é enfeite: ele carrega a diferença, que é o número
   que a pessoa estava tendo de calcular de cabeça entre um cartão e outro. */
function seloDe(chave, c) {
  if (c.menor === 'empate') {
    return '<span class="cenario-selo cenario-selo--neutro">Praticamente igual</span>';
  }
  if (c.menor === chave) {
    return '<span class="cenario-selo">Menor conta no ano</span>';
  }
  return `<span class="cenario-selo cenario-selo--neutro">${moedaBR(c.diferenca)}
    a mais no ano</span>`;
}

function cartaoCenario({ chave, nome, sub, parcelas, total, peso, nota, menor, selo }) {
  return `
    <article class="cenario ${menor ? 'cenario--menor' : ''}" data-cenario="${chave}">
      <header class="cenario-topo">
        <h3 class="cenario-nome">${nome}</h3>
        <p class="cenario-sub">${sub}</p>
        ${selo}
      </header>
      <div class="cenario-parcelas">${parcelas.join('')}</div>
      <div class="cenario-total">
        <span class="cenario-total-nome">Total de imposto no ano</span>
        <strong class="cenario-total-valor">${moedaBR(total)}</strong>
      </div>
      <p class="cenario-peso">${peso ? `${peso} da sua receita` : ''}</p>
      <div class="cenario-nota">${nota || ''}</div>
    </article>`;
}

function cartaoPf(d) {
  const c = d.comparacao;
  return cartaoCenario({
    chave: 'pf',
    nome: 'Pessoa Física',
    sub: 'Como a maior parte dos produtores declara hoje',
    parcelas: [
      parcela('Imposto de Renda', moedaBR(d.pf.irpf),
        `tabela progressiva sobre a base de ${moedaBR(d.base.base)}`),
      parcela('IBS / CBS', d.pf.paga_ibscbs
        ? moedaBR(d.pf.ibscbs)
        : '<span class="isento">isento</span>',
      d.pf.paga_ibscbs
        ? `${percentBR(d.pf.aliquota_ibscbs)} sobre a mesma base do IR`
        : 'não incide neste enquadramento'),
    ],
    total: d.pf.total,
    peso: c.peso_pf !== null ? percentBR(c.peso_pf) : '',
    nota: `<p>Seu enquadramento: ${d.pf.rotulo}</p>`,
    menor: c.menor === 'pf',
    selo: seloDe('pf', c),
  });
}

function cartaoPj(d) {
  const c = d.comparacao;
  const credito = d.pj.credito_acumulado > 0
    ? `<p>O crédito das despesas superou o imposto da receita em
       ${moedaBR(d.pj.credito_acumulado)}. Não vira dinheiro de volta: fica como
       crédito para os períodos seguintes.</p>`
    : '';
  return cartaoCenario({
    chave: 'pj',
    nome: 'Pessoa Jurídica',
    sub: 'Lucro Presumido rural',
    parcelas: [
      parcela('IRPJ + CSLL', moedaBR(d.pj.irpj_csll),
        `${percentBR(d.pj.aliquota_irpj_csll)} do faturamento, com ou sem lucro`),
      parcela('IBS / CBS', moedaBR(d.pj.ibscbs),
        `${moedaBR(d.pj.ibscbs_debito)} sobre a receita menos
         ${moedaBR(d.pj.ibscbs_credito)} de crédito das despesas`),
    ],
    total: d.pj.total,
    peso: c.peso_pj !== null ? percentBR(c.peso_pj) : '',
    nota: credito,
    menor: c.menor === 'pj',
    selo: seloDe('pj', c),
  });
}

/* ── A leitura: por que os dois números são o que são ─────────────────────── */

/* O que PRODUZ a diferença, nos números desta pessoa. É a parte que a tela
   antiga não tinha e que faz o resultado ensinar em vez de só informar.

   Só roda quando a PF tem imposto a pagar — o caso de zero tem explicação
   própria, e ali a base é zero e nenhuma destas frases seria verdadeira. */
function motorDaDiferenca(d) {
  if (d.base.limitador === 'teto de 20%') {
    return `<p>O que segura a conta da pessoa física aqui é o
      <strong>teto de 20%</strong>: o seu resultado foi
      ${moedaBR(d.base.liquido)}, mas a tributação da PF incide sobre no máximo
      ${moedaBR(d.base.teto)}. A pessoa jurídica não tem esse teto — ela paga
      sobre o faturamento inteiro e desconta as despesas como crédito.</p>`;
  }
  if (!d.pf.paga_ibscbs) {
    return `<p>Como pessoa física você não entra na conta do IBS/CBS
      ${d.entradas.cooperativa
        ? '— a cooperativa zera esse imposto'
        : '— você declarou não ser contribuinte'}.
      Como pessoa jurídica, entra: ${moedaBR(d.pj.ibscbs_debito)} sobre a
      receita, menos ${moedaBR(d.pj.ibscbs_credito)} de crédito das despesas.</p>`;
  }
  return `<p>O <strong>IBS/CBS dá o mesmo dos dois lados
    (${moedaBR(d.pf.ibscbs)})</strong>, porque incide sobre a mesma base. A
    diferença inteira está entre o Imposto de Renda da pessoa física
    (${moedaBR(d.pf.irpf)}) e os ${percentBR(d.pj.aliquota_irpj_csll)} de
    IRPJ + CSLL da jurídica (${moedaBR(d.pj.irpj_csll)}).</p>`;
}

/* Explica um resultado zerado na PF. Foi o retorno da cliente que trouxe isto:
   a tela mostrava "R$ 0,00" em verde, sem uma palavra, e zero sem explicação
   parece defeito.

   E zero NÃO é caso raro: a base é limitada a 20% da receita, então qualquer
   receita até ~R$ 134.800 sem despesas cai na faixa de isenção do IRPF.

   O contraste agora é a PJ, e ele inverte a leitura fácil: onde a PF zera, a
   jurídica quase sempre paga — o Lucro Presumido não tem faixa de isenção nem
   olha o resultado. */
function explicarZero(d) {
  const contraste = d.pj.total > 0
    ? ` Do outro lado, a pessoa jurídica pagaria
        <strong>${moedaBR(d.pj.total)}</strong> com os seus mesmos números: o
        Lucro Presumido cobra ${percentBR(d.pj.aliquota_irpj_csll)} do
        faturamento, sem faixa de isenção.`
    : '';

  switch (d.motivo_zero) {
    case 'sem_receita':
      return `Não há o que calcular sem receita informada. Volte e informe
        quanto a atividade faturou no último ano.`;
    case 'sem_resultado':
      return `As despesas informadas (${moedaBR(d.entradas.despesas)}) alcançaram
        ou passaram a receita (${moedaBR(d.entradas.receitas)}), então não há
        resultado a tributar como pessoa física neste ano.${contraste}`;
    default:
      return `<strong>Como pessoa física não há imposto a pagar com estes
        números.</strong> A sua base de cálculo ficou em ${moedaBR(d.base.base)},
        abaixo da faixa em que o Imposto de Renda começa a incidir
        (${moedaBR(d.faixa_isencao)}).${contraste}`;
  }
}

/* O que o número SIGNIFICA. Um valor de imposto sozinho não responde nada — foi
   exatamente o retorno da cliente ("é economia? enquadramento errado?"). */
function explicarValor(d) {
  const c = d.comparacao;
  if (c.menor === 'empate') {
    return `Com os seus números, os dois caminhos custam praticamente o mesmo:
      ${moedaBR(d.pf.total)} como pessoa física e ${moedaBR(d.pj.total)} como
      jurídica. <strong>Aqui a decisão não é fiscal</strong> — é sobre estrutura,
      sucessão e obrigações, não sobre imposto.`;
  }
  const barato = c.menor === 'pj' ? 'jurídica' : 'física';
  const caro = c.menor === 'pj' ? 'física' : 'jurídica';
  return `Pessoa física: <strong>${moedaBR(d.pf.total)}</strong>.
    Pessoa jurídica: <strong>${moedaBR(d.pj.total)}</strong>.
    Com os seus números a pessoa ${barato} sai
    <strong>${moedaBR(c.diferenca)} por ano</strong> mais barata que a
    ${caro}.`;
}

/* O título diz O QUE É o número em destaque. "A conta anual" não respondia se
   era custo, economia ou potencial — e essa foi a dúvida. */
function manchete(d, primeiro) {
  const c = d.comparacao;
  if (c.menor === 'empate') {
    return {
      titulo: `${primeiro}os dois caminhos dão praticamente a mesma conta`,
      destaque: moedaBR(d.pf.total),
      legenda: 'de imposto no ano, em qualquer um dos dois',
    };
  }
  if (c.menor === 'pj') {
    return {
      titulo: `${primeiro}como pessoa jurídica a sua conta anual seria menor`,
      destaque: moedaBR(c.diferenca),
      legenda: 'de diferença por ano, a favor da pessoa jurídica',
    };
  }
  return {
    titulo: `${primeiro}com os seus números a pessoa física ainda é mais barata`,
    destaque: moedaBR(c.diferenca),
    legenda: 'de diferença por ano, a favor da pessoa física',
  };
}

/* ── Render ───────────────────────────────────────────────────────────────── */

export function renderResultado(d, { nome } = {}) {
  const alvo = el('#resultado');
  const zerado = d.motivo_zero !== null;
  const primeiro = nome ? `${String(nome).split(' ')[0]}, ` : '';
  const m = manchete(d, primeiro);

  el('#resultado-abertura', alvo).innerHTML = `
    <p class="eyebrow">Resultado da simulação</p>
    <h2>${m.titulo}</h2>
    <p class="total-destaque">${m.destaque}</p>
    <p class="total-legenda-destaque">${m.legenda}</p>
    <p class="total-leitura">
      ${zerado ? explicarZero(d) : explicarValor(d)}
    </p>`;

  el('#resultado-cenarios', alvo).innerHTML = cartaoPf(d) + cartaoPj(d);

  el('#resultado-leitura', alvo).innerHTML = zerado ? '' : motorDaDiferenca(d);

  /* A nota de vigência. IBS e CBS ainda não são cobrados: em 2025 e 2026 a
     parcela de IBS/CBS dos DOIS cartões não existe. Sem esta frase, a página
     apresenta como conta de hoje uma conta que só começa em 2027.

     ⚠️ Sem números pré-Reforma de propósito. A conta atual da PJ inclui
     PIS/COFINS cumulativo, que este modelo não tem — publicar um total de 2026
     seria subestimar em silêncio. */
  el('#resultado-vigencia', alvo).innerHTML = `
    <strong>Em 2025 e 2026 ainda não há IBS/CBS.</strong> Os dois novos impostos
    só passam a ser cobrados a partir de ${ANO_INICIO_IBSCBS} — até lá vale, na
    pessoa física, apenas o Imposto de Renda, e na jurídica, os tributos do
    regime atual. Esta simulação mostra o cenário <strong>já com a Reforma em
    vigor</strong>, que é a conta com que você vai conviver.`;

  el('#resultado-memoria', alvo).innerHTML = `
    <h4 class="memoria-titulo">Pessoa física</h4>
    <dl class="memoria">
      <div><dt>Receita bruta anual</dt><dd>${moedaBR(d.entradas.receitas)}</dd></div>
      <div><dt>Despesas no ano</dt><dd>${moedaBR(d.entradas.despesas)}</dd></div>
      <div><dt>Resultado (receita − despesas)</dt><dd>${moedaBR(d.base.liquido)}</dd></div>
      <div><dt>Teto de 20% da receita</dt><dd>${moedaBR(d.base.teto)}</dd></div>
      <div class="memoria--destaque">
        <dt>Base de cálculo</dt>
        <dd>${moedaBR(d.base.base)}
          <small>limitada pelo ${d.base.limitador}</small></dd>
      </div>
      <div><dt>Faixa do IRPF</dt>
        <dd>${percentBR(d.base.aliq_irpf)}
          <small>menos dedução de ${moedaBR(d.base.ded_irpf)}</small></dd></div>
      <div><dt>Alíquota de IBS/CBS</dt>
        <dd>${d.pf.paga_ibscbs ? percentBR(d.pf.aliquota_ibscbs) : '—'}
          <small>${percentBR(ALIQ_IBSCBS_CHEIA)} com redução de
            ${percentBR(REDUCAO_AGRO)} do agro</small></dd></div>
      <div><dt>Total como pessoa física</dt><dd>${moedaBR(d.pf.total)}</dd></div>
    </dl>

    <h4 class="memoria-titulo">Pessoa jurídica — Lucro Presumido rural</h4>
    <dl class="memoria">
      <div><dt>IRPJ</dt>
        <dd>${moedaBR(d.pj.irpj)}<small>1,20% do faturamento</small></dd></div>
      <div><dt>CSLL</dt>
        <dd>${moedaBR(d.pj.csll)}<small>1,08% do faturamento</small></dd></div>
      <div><dt>IBS/CBS sobre a receita</dt>
        <dd>${moedaBR(d.pj.ibscbs_debito)}
          <small>${percentBR(d.pj.aliquota_ibscbs)} de ${moedaBR(d.entradas.receitas)}</small></dd></div>
      <div><dt>Crédito das despesas</dt>
        <dd>− ${moedaBR(d.pj.ibscbs_credito)}
          <small>${percentBR(d.pj.aliquota_ibscbs)} de ${moedaBR(d.entradas.despesas)}</small></dd></div>
      <div class="memoria--destaque">
        <dt>IBS/CBS devido</dt>
        <dd>${moedaBR(d.pj.ibscbs)}
          <small>${d.pj.credito_acumulado > 0
            ? `crédito acumulado de ${moedaBR(d.pj.credito_acumulado)}`
            : 'receita menos crédito'}</small></dd>
      </div>
      <div><dt>Total como pessoa jurídica</dt><dd>${moedaBR(d.pj.total)}</dd></div>
    </dl>
    <p class="memoria-nota">
      Na pessoa física o IBS/CBS incide sobre a mesma base do Imposto de Renda,
      limitada a 20% da receita; na jurídica ele é cobrado sobre a receita e
      devolvido como crédito sobre as despesas. Acima de
      ${moedaBR(LIMITE_RECEITA)} de receita, ser contribuinte deixa de ser
      escolha na pessoa física.
    </p>`;

  renderDedutiveis(el('#resultado-dedutiveis', alvo));

  /* A ressalva que impede a tela de virar folheto. Ela é obrigatória
     justamente quando a PJ ganha — e é o momento em que dá mais vontade de
     tirá-la. Nomeia o que a conta NÃO mede, que é o que decide o caso real. */
  el('#resultado-ressalva', alvo).innerHTML = `
    <p class="ressalva">
      <strong>Esta comparação não é uma recomendação.</strong> Ela mede imposto,
      e imposto não é a conta inteira: virar pessoa jurídica traz contabilidade
      e obrigações acessórias, regras de pró-labore e de distribuição de lucros,
      contribuição previdenciária própria e custo de abertura e manutenção do
      CNPJ — nada disso entra nos números acima. O caminho que serve para você é
      conversa com o seu contador, com estes números na mão.
    </p>`;
}
