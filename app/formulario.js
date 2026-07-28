/* ==========================================================================
   formulario.js — validação e leitura dos formulários
   --------------------------------------------------------------------------
   A marcação (label/for, aria-*, autocomplete) vive no HTML, onde dá para
   revisar. Aqui fica só o comportamento.

   Validação no cliente é UX, não segurança: quem valida de verdade é o fluxo
   n8n do outro lado.
   ========================================================================== */

import { parseMoedaBR } from './formato.js';

/* Deliberadamente frouxo. Regex de e-mail apertada reprova endereço válido, e
   um lead perdido custa mais que um lead com e-mail torto. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarEmail(v) {
  return EMAIL.test(String(v || '').trim());
}

/* 10 ou 11 dígitos (fixo ou celular), já sem máscara. */
export function validarWhatsapp(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
}

export function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

/* Marca ou limpa o estado de erro de um campo. `aria-invalid` e
   `aria-describedby` são o que faz o erro existir para leitor de tela — sem
   eles a mensagem vermelha é invisível para quem não enxerga a tela. */
export function marcarErro(input, mensagem) {
  const campo = input.closest('.campo');
  const alvo = campo?.querySelector('.campo-erro');
  if (mensagem) {
    input.setAttribute('aria-invalid', 'true');
    campo?.classList.add('campo--erro');
    if (alvo) {
      alvo.textContent = mensagem;
      input.setAttribute('aria-describedby', alvo.id);
    }
  } else {
    input.removeAttribute('aria-invalid');
    campo?.classList.remove('campo--erro');
    if (alvo) alvo.textContent = '';
  }
  return !mensagem;
}

/* ── Dados fiscais ──────────────────────────────────────────────────────────
   Devolve `{ ok, dados }`. Campo vazio é erro, não zero: rodar a conta com
   dado que ninguém informou produz um número que parece resposta. */
export function lerDadosFiscais(form) {
  const receitasEl = form.querySelector('#receitas');
  const despesasEl = form.querySelector('#despesas');

  const receitas = parseMoedaBR(receitasEl.value);
  const despesas = parseMoedaBR(despesasEl.value);

  let ok = true;
  ok = marcarErro(receitasEl, receitas === null
    ? 'Informe a receita bruta anual.'
    : receitas < 0 ? 'A receita não pode ser negativa.' : '') && ok;
  ok = marcarErro(despesasEl, despesas === null
    ? 'Informe as despesas anuais (use 0 se não houver).'
    : despesas < 0 ? 'As despesas não podem ser negativas.' : '') && ok;

  if (!ok) return { ok: false, dados: null };

  return {
    ok: true,
    dados: {
      receitas,
      despesas,
      cooperativa: form.querySelector('input[name="cooperativa"]:checked')?.value === 'sim',
      contribuinte: form.querySelector('input[name="contribuinte"]:checked')?.value === 'sim',
    },
  };
}

/* ── Contato ────────────────────────────────────────────────────────────────
   O texto do consentimento é lido LITERAL do DOM, não de uma constante em JS.
   Se um dia alguém reescrever o texto na tela sem atualizar a constante, o que
   ficaria gravado seria uma frase que a pessoa nunca leu. */
export function lerContato(form) {
  const nomeEl = form.querySelector('#nome');
  const emailEl = form.querySelector('#email');
  const zapEl = form.querySelector('#whatsapp');
  const consentEl = form.querySelector('#consentimento');

  let ok = true;
  ok = marcarErro(nomeEl, nomeEl.value.trim().length < 2
    ? 'Informe seu nome.' : '') && ok;
  ok = marcarErro(emailEl, validarEmail(emailEl.value)
    ? '' : 'Informe um e-mail válido.') && ok;
  ok = marcarErro(zapEl, validarWhatsapp(zapEl.value)
    ? '' : 'Informe o WhatsApp com DDD.') && ok;
  ok = marcarErro(consentEl, consentEl.checked
    ? '' : 'É preciso concordar para receber o resultado.') && ok;

  if (!ok) return { ok: false, dados: null };

  return {
    ok: true,
    dados: {
      nome: nomeEl.value.trim(),
      email: emailEl.value.trim().toLowerCase(),
      whatsapp: soDigitos(zapEl.value),
      consentimento: true,
      consent_ts: new Date().toISOString(),
      /* Honeypot. Preenchido = bot; quem trata é o n8n, em silêncio. */
      empresa_site: form.querySelector('#empresa_site')?.value || '',
    },
    consentTexto: form.querySelector('#rotulo-consentimento')?.textContent
      .replace(/\s+/g, ' ').trim() || '',
  };
}

/* Máscara leve de telefone. Só cosmética — o payload leva só dígitos. */
export function mascararTelefone(input) {
  input.addEventListener('input', () => {
    const d = soDigitos(input.value).slice(0, 11);
    let saida = d;
    if (d.length > 6) {
      saida = d.length === 11
        ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
        : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    } else if (d.length > 2) {
      saida = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    } else if (d.length) {
      saida = `(${d}`;
    }
    input.value = saida;
  });
}
