/* ==========================================================================
   atribuicao.js — primeiro toque imutável + último toque por visita
   --------------------------------------------------------------------------
   PROVENIÊNCIA: copiado de `cliente-sabina-deweik` em 2026-07-28. NÃO é
   espelho daquele arquivo — repos de cliente são clonados sozinhos e têm
   ciclos de vida independentes; uma referência cruzada entre repos apontaria
   para um caminho que não existe do outro lado.

   UMA DIFERENÇA em relação ao original: `pzAtribuicaoPlana` também devolve
   `gclid` e `fbclid`. A Master tem mídia paga rodando, e sem esses dois o
   casamento por CAPI não fecha — a mesma conversão conta duas vezes. Se esta
   versão for promovida ao template, é ela que deve prevalecer.

   ⚠️ Este arquivo é genérico: nada nele é da Master Academy. O lugar certo
   dele é o `map-client-template`, descendo para cada cliente por cópia, como
   os `padrao-*.md` e o `.gitleaks.toml`. Enquanto isso não acontece, cada
   cliente carrega a sua cópia e a correção precisa ser propagada à mão.
   Registrado como dívida no README.md desta pasta.

   Por que existe: sem persistir a atribuição, quem chega por anúncio, sai e
   volta pelo Instagram no dia seguinte é gravado como orgânico — e o anúncio
   que pagou pelo lead fica sem crédito. Atribuição não é retroativa: o que não
   for capturado no momento da visita está perdido para sempre.

   Dialeto: script clássico que publica `window.pzAtribuicao`. Mantido igual ao
   da Sabina de propósito, para as cópias continuarem comparáveis e poderem ser
   promovidas ao template um dia sem tradução de dialeto no meio.
   ========================================================================== */

(function (janela) {
  'use strict';

  var CHAVE_FT = 'pz_ft';    /* primeiro toque — gravado uma vez, nunca mais */
  var CHAVE_LT = 'pz_lt';    /* último toque — sobrescrito quando há UTM nova */
  var CHAVE_VID = 'pz_vid';  /* visitor_id — liga visitas anônimas ao lead    */

  var CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'utm_term', 'gclid', 'fbclid'];

  /* Navegação privada e storage bloqueado não podem derrubar o formulário:
     sem atribuição o lead ainda entra, só que sem origem. */
  function ler(chave) {
    try { return janela.localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravar(chave, valor) {
    try { janela.localStorage.setItem(chave, valor); } catch (e) { /* segue o jogo */ }
  }

  function uuid() {
    try {
      if (janela.crypto && janela.crypto.randomUUID) return janela.crypto.randomUUID();
    } catch (e) { /* abaixo */ }
    return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function tocoAtual() {
    var q = new URLSearchParams(janela.location.search);
    var t = { referrer: janela.document.referrer || '', em: new Date().toISOString() };
    CAMPOS.forEach(function (c) {
      var v = q.get(c);
      if (v) t[c] = v;
    });
    return t;
  }

  function json(bruto) {
    if (!bruto) return null;
    try { return JSON.parse(bruto); } catch (e) { return null; }
  }

  janela.pzAtribuicao = function () {
    var atual = tocoAtual();
    var temUtm = CAMPOS.some(function (c) { return atual[c]; });

    /* Primeiro toque: só grava se ainda não existe. É ele que dá crédito à
       mídia que realmente trouxe a pessoa. */
    if (!ler(CHAVE_FT)) gravar(CHAVE_FT, JSON.stringify(atual));

    /* Último toque: sobrescreve, mas SÓ quando a visita traz atribuição nova.
       Sem essa condição, uma volta digitando o endereço direto apagaria o
       crédito da campanha que trouxe a pessoa da primeira vez. */
    if (temUtm) gravar(CHAVE_LT, JSON.stringify(atual));

    var vid = ler(CHAVE_VID);
    if (!vid) { vid = uuid(); gravar(CHAVE_VID, vid); }

    var ft = json(ler(CHAVE_FT)) || atual;
    var lt = json(ler(CHAVE_LT)) || ft;

    return { visitor_id: vid, ft: ft, lt: lt };
  };

  /* Achata o PRIMEIRO toque em colunas planas, para o n8n gravar direto na
     planilha sem precisar entender o objeto `attr`. É `ft` e não `lt` porque
     a atribuição de crédito da mídia é de primeiro toque. */
  janela.pzAtribuicaoPlana = function (attr) {
    var ft = (attr && attr.ft) || {};
    return {
      utm_source: ft.utm_source || '',
      utm_medium: ft.utm_medium || '',
      utm_campaign: ft.utm_campaign || '',
      utm_content: ft.utm_content || '',
      utm_term: ft.utm_term || '',
      gclid: ft.gclid || '',
      fbclid: ft.fbclid || '',
      referrer: ft.referrer || ''
    };
  };

  /* Captura já no carregamento: se a pessoa navegar antes de chegar ao
     formulário, o primeiro toque já está salvo. */
  try { janela.pzAtribuicao(); } catch (e) { /* nunca quebrar a página */ }

})(window);
