/* ==========================================================================
   formato.js — leitura e escrita de número em pt-BR
   --------------------------------------------------------------------------
   Existe porque "R$ 1.234,56" e "1234.56" são o mesmo número escrito em duas
   convenções, e confundir as duas é o jeito mais fácil de um simulador de
   imposto errar por um fator de mil sem dar erro nenhum.
   ========================================================================== */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat('pt-BR', {
  style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function moedaBR(n) {
  return BRL.format(Number.isFinite(Number(n)) ? Number(n) : 0);
}

export function percentBR(fracao) {
  return PCT.format(Number.isFinite(Number(fracao)) ? Number(fracao) : 0);
}

/* Lê o que a pessoa digitou e devolve número, ou null se não deu para ler.
   `null` (e não 0) é importante: campo vazio e campo com zero são coisas
   diferentes, e tratar vazio como zero faz a conta rodar com dado que ninguém
   informou.

   A ambiguidade real é o ponto sozinho: "500.000" são quinhentos mil e
   "500.50" são quinhentos e cinquenta centavos. A regra é a convenção pt-BR —
   ponto seguido de exatamente 3 dígitos é separador de milhar; qualquer outra
   coisa é decimal. */
export function parseMoedaBR(bruto) {
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;

  let s = String(bruto).trim();
  if (!s) return null;

  const negativo = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');

  if (temVirgula && temPonto) {
    /* Convenção completa: ponto é milhar, vírgula é decimal. */
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto) {
    const depois = s.slice(s.lastIndexOf('.') + 1);
    if (depois.length === 3) s = s.replace(/\./g, '');   /* milhar */
    /* senão: já está em notação decimal, não mexe */
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/* Aceita as respostas de sim/não que aparecem num formulário e numa conversa.
   Devolve null quando não dá para decidir — quem chama trata como "não
   respondeu", nunca como "não". */
export function parseSimNao(bruto) {
  if (typeof bruto === 'boolean') return bruto;
  if (bruto === null || bruto === undefined) return null;
  /* ̀-ͯ é o bloco de acentos combinantes: "Não" vira "nao".
     Escrito com escape, e não com os caracteres literais, porque acento
     combinante solto no código-fonte não sobrevive a toda cadeia de edição. */
  const s = String(bruto).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return null;
  if (['sim', 's', 'true', '1', 'yes', 'y'].includes(s)) return true;
  if (['nao', 'n', 'false', '0', 'no'].includes(s)) return false;
  return null;
}
