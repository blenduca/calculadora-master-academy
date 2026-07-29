/* ==========================================================================
   resultado.js — render do diagnóstico
   --------------------------------------------------------------------------
   Render puro: recebe a saída de `diagnosticar()` e escreve na tela. Não faz
   conta, não arredonda, não decide nada. Se um número aqui estiver errado, o
   erro está em calculo.js — e lá tem teste.

   Duas regras que a tela não pode violar:
   · O quadro da pessoa é marcado por RÓTULO, não só por cor. Escala visual sem
     canal secundário é inacessível.
   · A memória de cálculo fica aberta a um clique. Um número de imposto sem a
     conta atrás é pedir confiança cega — e este é o material que a Master vai
     usar para ganhar confiança.
   ========================================================================== */

import { ALIQ_IBSCBS_CHEIA, LIMITE_RECEITA, REDUCAO_AGRO } from './calculo.js';
import { moedaBR, percentBR } from './formato.js';

const el = (sel, raiz = document) => raiz.querySelector(sel);

function linhaQuadro(q) {
  const marcado = q.aplicavel ? ' quadro--seu' : '';
  const selo = q.aplicavel
    ? '<span class="quadro-selo">Seu enquadramento</span>'
    : '';
  return `
    <tr class="quadro${marcado}">
      <th scope="row">
        <span class="quadro-rotulo">${q.rotulo}</span>
        ${selo}
      </th>
      <td class="num">${moedaBR(q.irpf)}</td>
      <td class="num">${q.paga_ibscbs ? moedaBR(q.ibscbs) : '<span class="isento">isento</span>'}</td>
      <td class="num num--total">${moedaBR(q.total)}</td>
    </tr>`;
}

/* Explica um resultado zerado. Foi o retorno da cliente que trouxe isto: a tela
   mostrava "R$ 0,00" em verde, sem uma palavra, e zero sem explicação parece
   defeito.

   E zero NÃO é caso raro: a base é limitada a 20% da receita, então qualquer
   receita até ~R$ 134.800 sem despesas cai na faixa de isenção do IRPF. */
function explicarZero(d) {
  const faixa = moedaBR(d.faixa_isencao);
  const c = d.comparacao;

  /* Zero no SEU enquadramento não quer dizer zero em todos. O IRPF tem faixa de
     isenção; o IBS/CBS não tem nenhuma — incide desde o primeiro real de base.
     Então quem paga zero por ser não-contribuinte pagaria algo se fosse.

     Essa é a informação mais útil da tela para quem zerou, e ela estava
     escondida na tabela. Sem ela, "R$ 0,00" não ensina nada. */
  const contraste = c.maximo > 0
    ? ` Isso vale para o seu enquadramento: com os seus mesmos números, quem é
        contribuinte de IBS/CBS pagaria <strong>${moedaBR(c.maximo)}</strong>
        por ano.`
    : '';

  switch (d.motivo_zero) {
    case 'sem_receita':
      return `Não há o que calcular sem receita informada. Volte e informe
        quanto a atividade faturou no último ano.`;
    case 'sem_resultado':
      return `As despesas informadas (${moedaBR(d.entradas.despesas)}) alcançaram
        ou passaram a receita (${moedaBR(d.entradas.receitas)}), então não há
        resultado a tributar neste ano.${contraste}`;
    default:
      return `<strong>Não há imposto a pagar com estes números.</strong> A sua
        base de cálculo ficou em ${moedaBR(d.base.base)}, abaixo da faixa em que
        o Imposto de Renda começa a incidir (${faixa}).${contraste}`;
  }
}

/* O que o número SIGNIFICA. Um valor de imposto sozinho não responde nada — foi
   exatamente o retorno da cliente ("é economia? enquadramento errado?").
   O sentido está na comparação, que a ferramenta já calculava e escondia numa
   tabela lá embaixo.

   ⚠️ Comparar não é recomendar. Ser cooperado ou contribuinte tem consequência
   de negócio; aqui só se diz quanto o enquadramento PESA, nunca o que fazer. */
function explicarValor(d, meu) {
  const c = d.comparacao;
  const peso = c.peso_na_receita !== null
    ? `<strong>${percentBR(c.peso_na_receita)} da receita</strong> de
       ${moedaBR(d.entradas.receitas)} que você informou`
    : '';

  if (c.enquadramento_indiferente) {
    return `${peso ? `Equivale a ${peso}. ` : ''}Nos cinco cenários da tabela
      abaixo o resultado é o mesmo: com estes números, o enquadramento não muda
      o que você paga.`;
  }
  if (c.sou_o_mais_barato) {
    return `${peso ? `Equivale a ${peso}. ` : ''}<strong>É o menor valor entre os
      cinco cenários.</strong> Nos demais, com os seus mesmos números, o imposto
      chega a ${moedaBR(c.maximo)} — uma diferença de
      ${moedaBR(c.amplitude)} por ano.`;
  }
  return `${peso ? `Equivale a ${peso}. ` : ''}Com os seus mesmos números, o
    imposto vai de <strong>${moedaBR(c.minimo)}</strong> a
    <strong>${moedaBR(c.maximo)}</strong> conforme o enquadramento
    ${c.sou_o_mais_caro ? '— e o seu é o mais caro dos cinco' : ''}.
    O seu está <strong>${moedaBR(c.acima_do_minimo)} acima</strong> do menor
    cenário possível.`;
}

export function renderResultado(d, { nome } = {}) {
  const meu = d.quadros.find((q) => q.aplicavel);
  const alvo = el('#resultado');
  const zerado = d.motivo_zero !== null;

  const primeiro = nome ? `${String(nome).split(' ')[0]}, ` : '';

  /* O título diz O QUE É o número, não onde ele aparece. "A conta anual" não
     respondia se era custo, economia ou potencial — e essa foi a dúvida. */
  el('#resultado-abertura', alvo).innerHTML = `
    <p class="eyebrow">Resultado da simulação</p>
    <h2>${primeiro}este é o imposto que a sua atividade rural pagaria por ano</h2>
    <p class="total-destaque">${moedaBR(meu.total)}</p>
    <p class="total-leitura">
      ${zerado ? explicarZero(d) : explicarValor(d, meu)}
    </p>
    <p class="total-legenda">Seu enquadramento: ${meu.rotulo}</p>`;

  el('#resultado-parcelas', alvo).innerHTML = `
    <div class="parcela">
      <span class="parcela-nome">Imposto de Renda</span>
      <span class="parcela-valor">${moedaBR(meu.irpf)}</span>
    </div>
    <div class="parcela">
      <span class="parcela-nome">IBS / CBS</span>
      <span class="parcela-valor">${
        meu.paga_ibscbs
          ? moedaBR(meu.ibscbs)
          : '<span class="isento">isento neste cenário</span>'
      }</span>
    </div>
    <div class="parcela parcela--total">
      <span class="parcela-nome">Total de imposto no ano</span>
      <span class="parcela-valor">${moedaBR(meu.total)}</span>
    </div>`;

  el('#resultado-memoria', alvo).innerHTML = `
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
        <dd>${meu.paga_ibscbs ? percentBR(meu.aliquota_ibscbs) : '—'}
          <small>${percentBR(ALIQ_IBSCBS_CHEIA)} com redução de
            ${percentBR(REDUCAO_AGRO)} do agro</small></dd></div>
    </dl>
    <p class="memoria-nota">
      O IBS/CBS incide sobre a mesma base do Imposto de Renda, não sobre a
      receita bruta. Acima de ${moedaBR(LIMITE_RECEITA)} de receita, ser
      contribuinte deixa de ser escolha.
    </p>`;

  el('#resultado-comparacao', alvo).innerHTML = `
    <table class="tabela-quadros">
      <caption>O mesmo produtor, os mesmos números, enquadramentos diferentes</caption>
      <thead>
        <tr>
          <th scope="col">Cenário</th>
          <th scope="col" class="num">IRPF</th>
          <th scope="col" class="num">IBS / CBS</th>
          <th scope="col" class="num">Total</th>
        </tr>
      </thead>
      <tbody>${d.quadros.map(linhaQuadro).join('')}</tbody>
    </table>`;
}
