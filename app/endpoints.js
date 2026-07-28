/* ==========================================================================
   endpoints.js — ponto único de acoplamento com a rede
   --------------------------------------------------------------------------
   Regra da casa: endpoint novo nasce num único módulo, nunca duplicado em
   duas páginas. Os dois funis da Master hoje têm a URL do webhook hard-coded
   no meio do código — é a dívida que este arquivo existe para não repetir.

   ⚠️ SÃO DUAS INSTÂNCIAS DE n8n, NÃO SÃO ALIAS.
   `automacao.bagents.cloud` serve os fluxos LEGADOS (é onde os dois funis da
   Master estão hoje). `bn8n.bagents.cloud` é a instância nova, versionada, e é
   onde os fluxos desta ferramenta são publicados. Apontar para a errada dá 404
   em produção sem nenhuma pista do motivo.
   (Confirmado pelo Ricardo em 27/07; ver cliente-sabina-deweik/.../endpoints.js.)
   ========================================================================== */

export const EM_DESENVOLVIMENTO =
  ['localhost', '127.0.0.1'].includes(location.hostname);

/* Produção é uma LISTA DE HOSTS EXATOS, e o resto é validação.

   A inversão importa. Enquanto a regra foi "`*.vercel.app` é validação", cada
   preview de branch ficava seguro de graça — mas a produção também, porque ela
   mora num `vercel.app`. Listar o host exato resolve os dois lados: a URL de
   produção coleta, e todo preview (`...-git-<branch>-....vercel.app`) continua
   sem gravar contato nem gastar token.

   Em qualquer host fora desta lista a página entra em modo de aprovação: o
   cálculo é real, o assistente fica desligado e nenhum contato é gravado. O
   padrão continua falhando para "não coleta e não gasta".

   ⚠️ **Domínio novo tem que entrar aqui**, senão ele nasce mudo. */
const HOSTS_DE_PRODUCAO = [
  'calculadora-master-academy.vercel.app',
  'calculadora.academymaster.com.br',
];

export const EM_VALIDACAO =
  !EM_DESENVOLVIMENTO && !HOSTS_DE_PRODUCAO.includes(location.hostname);

const BASE = EM_DESENVOLVIMENTO
  ? 'http://localhost:5678'
  : 'https://bn8n.bagents.cloud';

/* Proxy da Anthropic. A chave NUNCA chega aqui — ela vive na credencial
   `master-academy-anthropic` dentro do n8n. O protótipo original chamava
   api.anthropic.com direto do navegador e sem header de autorização, o que
   funciona exatamente numa máquina: a de quem escreveu. */
export const CHAT_WEBHOOK = `${BASE}/webhook/ma-diagnostico-chat`;

/* Grava uma linha por diagnóstico na planilha do Google. Síncrono e sempre
   HTTP 200 com o veredito no corpo — mesmo desenho do fluxo de gratuidade da
   Sabina, o único fluxo de formulário nosso que já roda em produção. */
export const LEAD_WEBHOOK = `${BASE}/webhook/ma-diagnostico-lead`;
