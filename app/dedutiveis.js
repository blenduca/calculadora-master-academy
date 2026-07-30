/* ==========================================================================
   dedutiveis.js — o que conta como despesa da atividade rural
   --------------------------------------------------------------------------
   A lista aparece em DOIS lugares: como dica do campo "Despesas no ano" e como
   bloco explicativo no resultado. Ela mora aqui, e não literal nos dois, porque
   lista duplicada envelhece pela metade — alguém acrescenta um item na tela do
   resultado e o formulário segue pedindo outra coisa.

   Por que ela existe: a despesa é o campo que o produtor mais subestima, e na
   pessoa jurídica cada real de despesa comprovada vale 11,2 centavos de crédito
   de IBS/CBS. Subestimar a despesa não deixa a simulação "conservadora" — deixa
   ERRADA, e para o lado que faz a PJ parecer pior do que é.

   ⚠️ Isto é dica de preenchimento, não parecer fiscal. A lista nomeia as
   despesas mais comuns do custeio rural; o que é dedutível no caso concreto
   depende de comprovação e de escrituração, e a página diz isso.
   ========================================================================== */

export const DESPESAS_DEDUTIVEIS = [
  'Insumos — sementes, fertilizantes, corretivos',
  'Defensivos agrícolas',
  'Combustível e lubrificantes',
  'Máquinas, implementos e equipamentos',
  'Mão de obra e encargos',
  'Manutenção e peças de maquinário',
  'Custeio da lavoura e do rebanho',
];

/* Uma linha só, para caber sob o campo do formulário sem empurrar o botão para
   fora da primeira tela do celular. */
export function textoCompacto() {
  return `${DESPESAS_DEDUTIVEIS.join(' · ')}. Some tudo o que a atividade `
    + 'consumiu no ano e informe 0 se não houver.';
}

export function renderDedutiveis(alvo, { compacto = false } = {}) {
  if (!alvo) return;

  if (compacto) {
    alvo.textContent = textoCompacto();
    return;
  }

  alvo.innerHTML = `
    <h3 class="bloco-titulo">O que conta como despesa da atividade</h3>
    <p class="bloco-leitura">
      Estas são as despesas que entram na conta dos dois lados — e é por elas que
      vale a pena somar tudo antes de simular.
      <strong>Na pessoa jurídica, cada real de despesa comprovada derruba 11,2
      centavos de IBS/CBS</strong>, porque o imposto é cobrado sobre a receita e
      devolvido como crédito sobre o que foi gasto.
    </p>
    <ul class="dedutiveis">
      ${DESPESAS_DEDUTIVEIS.map((item) => `<li>${item}</li>`).join('')}
    </ul>
    <p class="bloco-ressalva">
      A lista é de orientação. O que é efetivamente dedutível depende de nota
      fiscal e de escrituração — é assunto do seu contador, não desta tela.
    </p>`;
}
