/* ==========================================================================
   calculo.js — o núcleo determinístico da calculadora
   --------------------------------------------------------------------------
   NADA aqui depende de rede, de DOM ou de IA. É função pura, testável por
   `node --test`, e é a ÚNICA coisa que produz número nesta ferramenta.

   Por que essa separação é dura: a camada de conversa (chat.js) extrai os
   quatro valores da fala da pessoa e para por aí. Ela nunca calcula, nunca
   arredonda, nunca opina sobre imposto. Um LLM que faz conta erra em silêncio
   e o erro sai com a cara de resposta segura.

   ORIGEM DO MODELO
   A planilha `Calculadora Lidder Agro` está quebrada em quatro pontos (o IRPF
   dos Quadros 3–5 é literal digitado e não recalcula; `F34` aponta para a
   coluna H; `G33`/`H33` estão vazias contrariando o próprio rótulo `B18`; e os
   valores em cache são mutuamente inconsistentes). Este módulo implementa a
   INTENÇÃO DECLARADA dela — os rótulos `B17`/`B18` mais a matriz de quadros —
   e não os números congelados. Detalhe e prova no README.md desta pasta.

   ⚠️ PENDENTE DE VALIDAÇÃO FISCAL (Cirlei). Enquanto isso não acontecer, esta
   ferramenta não se publica. Ver README.md §Pendências.
   ========================================================================== */

/* Tabela progressiva do IRPF aplicada sobre a base anual.
   ⚠️ Ano-base NÃO confirmado — herdado da planilha, sem citação de fonte.
   Confirmar com a Cirlei e citar a base legal na página antes de distribuir. */
export const TABELA_IRPF = [
  { de: 0,        aliq: 0,     ded: 0 },
  { de: 26963.21, aliq: 0.075, ded: 2185.92 },
  { de: 33919.81, aliq: 0.15,  ded: 4729.91 },
  { de: 45012.61, aliq: 0.225, ded: 8105.85 },
  { de: 55976.17, aliq: 0.275, ded: 10904.66 },
];

export const ALIQ_IBSCBS_CHEIA = 0.28;  /* alíquota de referência IBS + CBS   */
export const REDUCAO_AGRO      = 0.60;  /* redução setorial do agro           */
/* 11,2 %. Mantido como expressão, não como literal, para o "de onde veio" ficar
   legível no próprio código. */
export const ALIQ_IBSCBS = ALIQ_IBSCBS_CHEIA * (1 - REDUCAO_AGRO);

/* Acima disso vira contribuinte obrigatório, independente de qualquer escolha. */
export const LIMITE_RECEITA = 3_600_000;

/* A base tributável é limitada a 20 % da receita bruta. */
export const TETO_SOBRE_RECEITA = 0.20;

/* Os cinco cenários. Os quatro primeiros são a matriz cooperativa × contribuinte
   em ordem de tabela-verdade; o quinto é a faixa obrigatória por receita.

   ⚠️ A NUMERAÇÃO (Quadro 1..4) é inferida: a planilha não rotula qual
   combinação é qual, e esta é a única atribuição compatível com as isenções que
   ela declara. Nada no cálculo depende da numeração — a regra de quem paga é
   derivada das condições, não do número. Os rótulos abaixo é que são mostrados
   à pessoa; o número é secundário e deve ser confirmado com a Cirlei. */
export const QUADROS = [
  { id: 1, cooperativa: false, contribuinte: false,
    rotulo: 'Não cooperado · não contribuinte de IBS/CBS' },
  { id: 2, cooperativa: false, contribuinte: true,
    rotulo: 'Não cooperado · contribuinte de IBS/CBS' },
  { id: 3, cooperativa: true,  contribuinte: false,
    rotulo: 'Cooperado · não contribuinte de IBS/CBS' },
  { id: 4, cooperativa: true,  contribuinte: true,
    rotulo: 'Cooperado · contribuinte de IBS/CBS' },
  { id: 5, obrigatorio: true,
    rotulo: 'Receita acima de R$ 3,6 milhões · contribuinte obrigatório' },
];

/* Arredondamento monetário. Sem isto, 0.28*(1-0.60)*100000 devolve
   11200.000000000002 e o número chega torto na planilha do cliente. */
export function centavos(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/* Maior faixa cujo piso a base alcança. `!(base > 0)` também cobre NaN. */
export function faixaDe(base) {
  if (!(base > 0)) return TABELA_IRPF[0];
  for (let i = TABELA_IRPF.length - 1; i >= 0; i -= 1) {
    if (base >= TABELA_IRPF[i].de) return TABELA_IRPF[i];
  }
  return TABELA_IRPF[0];
}

/* A base é comum aos cinco quadros — o que muda entre eles é só o IBS/CBS.
   Por isso ela é calculada uma vez e reaproveitada. */
export function calcularBase(receitas, despesas) {
  const r = Number(receitas) || 0;
  const d = Number(despesas) || 0;
  const liquido = r - d;
  const teto = r * TETO_SOBRE_RECEITA;
  /* Nunca negativa: prejuízo não gera imposto a pagar nesta simulação. */
  const base = Math.max(0, Math.min(liquido, teto));
  return { receitas: r, despesas: d, liquido, teto, base, faixa: faixaDe(base) };
}

export function calcularIrpf(base) {
  const f = faixaDe(base);
  return Math.max(0, f.aliq * base - f.ded);
}

/* Quem paga IBS/CBS. Esta é a regra inteira, e ela não consulta a numeração dos
   quadros — deriva das condições, que é o que a planilha de fato declara em
   `B17` ("SIM para COOPERATIVA → IBS/CBS = 0") e `B18` (receita ≥ 3,6 mi). */
export function pagaIbsCbs({ cooperativa, contribuinte, obrigatorio }) {
  if (obrigatorio) return true;
  if (cooperativa) return false;
  return Boolean(contribuinte);
}

/* Um quadro avaliado sobre a base já calculada.
   ⚠️ O IBS/CBS incide sobre a MESMA base do IRPF, não sobre a receita bruta.
   É o que a planilha faz nas células que ela calcula certo (F34 = 0,112 × base). */
export function calcularQuadro(quadro, dadosBase) {
  const paga = pagaIbsCbs(quadro);
  const aliquota = paga ? ALIQ_IBSCBS : 0;
  const irpf = centavos(calcularIrpf(dadosBase.base));
  const ibscbs = centavos(aliquota * dadosBase.base);
  return {
    id: quadro.id,
    rotulo: quadro.rotulo,
    paga_ibscbs: paga,
    aliquota_ibscbs: aliquota,
    irpf,
    ibscbs,
    total: centavos(irpf + ibscbs),
  };
}

/* Qual dos cinco cenários é o da pessoa.
   A faixa obrigatória vence qualquer combinação: acima de R$ 3,6 mi de receita
   não existe escolha a fazer. */
export function quadroAplicavel({ receitas, cooperativa, contribuinte }) {
  if ((Number(receitas) || 0) >= LIMITE_RECEITA) return QUADROS[4];
  return QUADROS.find(
    (q) => q.cooperativa === Boolean(cooperativa)
        && q.contribuinte === Boolean(contribuinte),
  );
}

/* A porta de entrada única. Devolve a base, o quadro da pessoa e os cinco
   cenários lado a lado — é a comparação que transforma o número em argumento. */
export function diagnosticar({ receitas, despesas, cooperativa, contribuinte }) {
  const entradas = {
    receitas: Number(receitas) || 0,
    despesas: Number(despesas) || 0,
    cooperativa: Boolean(cooperativa),
    contribuinte: Boolean(contribuinte),
  };
  const dadosBase = calcularBase(entradas.receitas, entradas.despesas);
  const aplicavel = quadroAplicavel(entradas);
  return {
    entradas,
    base: {
      liquido: centavos(dadosBase.liquido),
      teto: centavos(dadosBase.teto),
      base: centavos(dadosBase.base),
      /* Qual das duas travou a base — é isso que a memória de cálculo explica. */
      limitador: dadosBase.liquido <= dadosBase.teto ? 'resultado' : 'teto de 20%',
      aliq_irpf: dadosBase.faixa.aliq,
      ded_irpf: dadosBase.faixa.ded,
    },
    quadro_aplicavel: aplicavel.id,
    quadros: QUADROS.map((q) => ({
      ...calcularQuadro(q, dadosBase),
      aplicavel: q.id === aplicavel.id,
    })),
  };
}
