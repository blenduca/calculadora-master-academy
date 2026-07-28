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
    ? '<span class="quadro-selo">Seu cenário</span>'
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

export function renderResultado(d, { nome } = {}) {
  const meu = d.quadros.find((q) => q.aplicavel);
  const alvo = el('#resultado');

  const saudacao = nome ? `${String(nome).split(' ')[0]}, no` : 'No';

  el('#resultado-abertura', alvo).innerHTML = `
    <p class="eyebrow">Resultado da simulação</p>
    <h2>${saudacao} seu cenário, a conta anual é</h2>
    <p class="total-destaque">${moedaBR(meu.total)}</p>
    <p class="total-legenda">${meu.rotulo}</p>`;

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
      <span class="parcela-nome">Total no ano</span>
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
      <caption>Como a conta muda em cada cenário, com os seus números</caption>
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
