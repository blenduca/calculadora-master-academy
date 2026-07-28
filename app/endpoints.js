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

/* Host de validação: o cliente abre para aprovar, e ali NADA dispara POST de
   verdade — nem lead, nem chamada de IA que custe token da Master.

   ⚠️ `*.vercel.app` está nesta lista, e isso tem consequência: enquanto a
   ferramenta não tiver domínio próprio, TODO deploy é de validação. É o padrão
   seguro — falha para "não coleta e não gasta", nunca para o contrário.
   **Quando o domínio definitivo entrar, esta linha precisa mudar**, senão a
   produção continua muda. Se a decisão for manter uma URL `vercel.app` em
   produção, trocar por uma checagem do host exato. */
export const EM_VALIDACAO =
  location.hostname.endsWith('github.io')
  || location.hostname.endsWith('.vercel.app');

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
