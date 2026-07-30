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

   O bloco da PESSOA JURÍDICA vem da mesma planilha, aba `CENÁRIO UM`, células
   `B43:D49` (IRPJ 1,20 % + CSLL 1,08 % sobre o faturamento) e `K11:K13` (o
   IBS/CBS como débito sobre a receita menos crédito sobre a despesa).

   ⚠️ Lógica da PF validada pela Cirlei em 28/07/2026 e NO AR desde então. O
   cenário PJ é posterior (30/07) e ainda não passou pela mesma conferência —
   a maior pergunta aberta é o adicional de IRPJ de 10 % sobre o lucro presumido
   acima de R$ 240.000/ano, que a planilha não traz e este módulo não calcula.
   Ver README.md §Pendências e validacao/casos-de-validacao.md §perguntas 5 a 8.
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

/* ── Pessoa jurídica (Lucro Presumido rural) ──────────────────────────────────
   Planilha `Calculadora Lidder Agro`, aba `CENÁRIO UM`, células `B45`/`B46`.
   As duas incidem sobre o FATURAMENTO, não sobre a base do IRPF: a PJ não tem
   o teto de 20 % nem faixa de isenção. Consequência que a tela precisa dizer:
   no prejuízo a PJ paga assim mesmo, porque o presumido não olha o resultado. */
export const ALIQ_IRPJ = 0.012;    /* 1,20 % s/ faturamento */
export const ALIQ_CSLL = 0.0108;   /* 1,08 % s/ faturamento */
/* 2,28 %. Mantido como soma, não como literal, para o "de onde veio" ficar
   legível no próprio código — mesma razão de `ALIQ_IBSCBS`. */
export const ALIQ_IRPJ_CSLL = ALIQ_IRPJ + ALIQ_CSLL;

/* IBS e CBS só passam a ser cobrados neste ano. Antes disso a parcela de
   IBS/CBS dos dois lados da comparação simplesmente não existe — a tela declara
   isso em texto, e é por isso que a constante mora aqui e não no HTML. */
export const ANO_INICIO_IBSCBS = 2027;

/* Os cinco cenários. Os quatro primeiros são a matriz cooperativa × contribuinte
   em ordem de tabela-verdade; o quinto é a faixa obrigatória por receita.

   ⚠️ A NUMERAÇÃO (Quadro 1..4) é inferida: a planilha não rotula qual
   combinação é qual, e esta é a única atribuição compatível com as isenções que
   ela declara. Nada no cálculo depende da numeração — a regra de quem paga é
   derivada das condições, não do número. Os rótulos abaixo é que são mostrados
   à pessoa; o número é secundário e deve ser confirmado com a Cirlei. */
/* O quadro da faixa obrigatória. Nomeado porque a regra de alcançabilidade
   depende dele, e `QUADROS[4]` no meio de uma condição não se lê. */
export const QUADRO_OBRIGATORIO = 5;

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
  if ((Number(receitas) || 0) >= LIMITE_RECEITA) {
    return QUADROS.find((q) => q.id === QUADRO_OBRIGATORIO);
  }
  return QUADROS.find(
    (q) => q.cooperativa === Boolean(cooperativa)
        && q.contribuinte === Boolean(contribuinte),
  );
}

/* A mesma atividade rural apurada como PESSOA JURÍDICA no Lucro Presumido.
   Três diferenças estruturais em relação à PF, e cada uma tem consequência
   visível no resultado:

   1. IRPJ e CSLL incidem sobre a RECEITA BRUTA. Não há teto de 20 %, não há
      faixa de isenção e não há dedução — por isso a PJ paga mesmo no prejuízo.
   2. O IBS/CBS é DÉBITO menos CRÉDITO (planilha, `K11:K13`): 11,2 % do que
      entrou menos 11,2 % do que foi gasto. É o que faz a despesa comprovada
      valer dinheiro na PJ, e é o argumento inteiro da lista de dedutíveis.
   3. Crédito maior que débito NÃO vira imposto negativo. O excedente fica como
      crédito acumulado para os períodos seguintes; aqui ele é nomeado e
      devolvido separado, porque "-R$ 112.000 de imposto" seria uma promessa
      de restituição que não existe.

   ⚠️ O crédito está sendo calculado sobre a DESPESA TOTAL informada, não só
   sobre os insumos efetivamente tributados. É simplificação declarada — está
   escrita na página e registrada no doc de validação.

   COOPERATIVA (30/07/2026). Quem é associado a cooperativa não tem IBS/CBS aqui
   tampouco: a cooperativa responde pelo imposto, e o que sobra para a PJ é só
   IRPJ + CSLL sobre o faturamento. Duas escolhas dentro disso:

   · O bloco vai a zero INTEIRO — débito, crédito e crédito acumulado. Zerar só
     o débito deixaria o crédito das despesas inteiro como saldo credor, e todo
     cooperado veria na tela um "crédito acumulado" de seis dígitos: promessa de
     compensação futura que ninguém validou.
   · A cooperativa é INCONDICIONAL, ao contrário da PF, onde o degrau de
     R$ 3,6 mi vence a cooperativa e torna a pessoa contribuinte obrigatória.
     Consequência: acima do limite os dois cartões divergem — a PF paga, a PJ
     não. É decisão, não defeito, e a tela declara. Há teste-âncora para ela.

   ⚠️ Esta regra é POSTERIOR à liberação da Cirlei de 28/07, que cobre a PF. Por
   isso ela mora aqui e não em `pagaIbsCbs()`: aquele predicado é o caminho
   validado, e a condição da PJ é outra (só cooperativa, sem `contribuinte` e
   sem degrau). Misturar os dois faria o não-validado entrar no validado. */
export function calcularPj({ receitas, despesas, cooperativa }) {
  const r = Number(receitas) || 0;
  const d = Number(despesas) || 0;
  const pagaIbscbs = !cooperativa;

  const irpj = centavos(ALIQ_IRPJ * r);
  const csll = centavos(ALIQ_CSLL * r);
  const aliquota = pagaIbscbs ? ALIQ_IBSCBS : 0;
  const debito = centavos(aliquota * r);
  const credito = centavos(aliquota * d);
  const saldo = centavos(debito - credito);

  const irpjCsll = centavos(irpj + csll);
  const ibscbs = Math.max(0, saldo);

  return {
    irpj,
    csll,
    irpj_csll: irpjCsll,
    aliquota_irpj_csll: ALIQ_IRPJ_CSLL,
    /* Nome espelhado no de `calcularQuadro()`, de propósito: a tela compara os
       dois lados e não pode ter que reinferir a regra de cada um. */
    paga_ibscbs: pagaIbscbs,
    aliquota_ibscbs: aliquota,
    ibscbs_debito: debito,
    ibscbs_credito: credito,
    ibscbs,
    /* Quanto de crédito sobrou sem uso. Zero quando há imposto a pagar. */
    credito_acumulado: saldo < 0 ? centavos(-saldo) : 0,
    total: centavos(irpjCsll + ibscbs),
  };
}

/* A comparação que é a razão de existir desta versão: a mesma pessoa, os mesmos
   números, apurados como PF e como PJ.

   ⚠️ Comparar NÃO é recomendar — e agora isso pesa mais, porque a comparação
   tem lado vencedor. Aqui só saem fatos (qual é menor, por quanto, quanto pesa
   na receita). Virar PJ tem custo de contabilidade, obrigações acessórias e
   pró-labore que esta conta não mede, e é a tela que precisa dizer isso.

   E a PJ não ganha sempre: com margem acima de 20 % o teto da PF derruba a base
   do IRPF e a PF sai mais barata. Um empate de centavo é empate — arredondar
   duas contas diferentes produz diferenças de R$ 0,01 que não significam nada. */
export function compararPfPj(pf, pj, receitas) {
  const r = Number(receitas) || 0;
  const delta = centavos(pf.total - pj.total);
  let menor = 'empate';
  if (delta > 0.01) menor = 'pj';
  else if (delta < -0.01) menor = 'pf';

  return {
    menor,
    /* Sempre positiva: o lado está em `menor`, não no sinal. */
    diferenca: centavos(Math.abs(delta)),
    peso_pf: r > 0 ? pf.total / r : null,
    peso_pj: r > 0 ? pj.total / r : null,
  };
}

/* Por que o total deu zero. São três motivos diferentes, e a tela precisa
   distinguir: "você não informou receita" e "sua base é isenta" não são a mesma
   notícia, e mostrar R$ 0,00 sem dizer qual é dos dois é o que faz o resultado
   parecer defeito.

   Devolve null quando há imposto a pagar. */
export function motivoDeZero(dadosBase, total) {
  if (total > 0) return null;
  if (!(dadosBase.receitas > 0)) return 'sem_receita';
  if (dadosBase.liquido <= 0) return 'sem_resultado';   /* despesas ≥ receitas */
  return 'abaixo_da_faixa';                             /* base < 1ª faixa do IRPF */
}

/* A porta de entrada única. Devolve a base, a apuração da pessoa como PF, a
   mesma apuração como PJ e a comparação entre as duas — que é o que transforma
   um número de imposto em argumento.

   Os cinco quadros continuam sendo calculados: eles é que decidem QUAL é o
   número da PF (cooperado zera o IBS/CBS; acima de R$ 3,6 mi ser contribuinte
   deixa de ser escolha). O que mudou é que eles não vão mais à tela — a pessoa
   vê o resultado do quadro dela, e a comparação que ela vê é PF × PJ. */
export function diagnosticar({ receitas, despesas, cooperativa, contribuinte }) {
  const entradas = {
    receitas: Number(receitas) || 0,
    despesas: Number(despesas) || 0,
    cooperativa: Boolean(cooperativa),
    contribuinte: Boolean(contribuinte),
  };
  const dadosBase = calcularBase(entradas.receitas, entradas.despesas);
  const aplicavel = quadroAplicavel(entradas);
  const quadros = QUADROS.map((q) => ({
    ...calcularQuadro(q, dadosBase),
    aplicavel: q.id === aplicavel.id,
  }));
  const pf = quadros.find((q) => q.aplicavel);
  const pj = calcularPj(entradas);
  return {
    entradas,
    /* Faixa de isenção do IRPF — a tela precisa dela para explicar o zero. */
    faixa_isencao: TABELA_IRPF[1].de,
    motivo_zero: motivoDeZero(dadosBase, pf.total),
    pf,
    pj,
    comparacao: compararPfPj(pf, pj, entradas.receitas),
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
    quadros,
  };
}
