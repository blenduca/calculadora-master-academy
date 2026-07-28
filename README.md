# Calculadora da Reforma Tributária — Master Academy (cópia publicada)

> **GERADO. Não editar nada aqui à mão.** Esta pasta é montada por
> `clientes/cliente-master-academy/3-produto-escalavel/calculadora-reforma-tributaria/publicar.mjs`
> a partir do repo do cliente (privado, sem remote). Correção se faz na origem
> e republica — editar aqui cria drift silencioso.

## O que é

Simulador do impacto da Reforma Tributária na atividade rural. O produtor
informa quatro números e recebe a estimativa de Imposto de Renda, IBS/CBS e a
comparação entre os cinco cenários.

## ⚠️ Este deploy é de VALIDAÇÃO, não de produção

A página detecta o domínio `*.vercel.app` e entra em modo de aprovação:

- **O cálculo é o real.** Pode conferir com números de verdade.
- **O assistente de conversa está desligado** — os fluxos n8n ainda não existem.
- **Nenhum contato é gravado.** O formulário funciona e valida, mas o envio não
  dispara: nenhum dado pessoal sai da máquina de quem preencher.

Isso é padrão seguro, não limitação temporária esquecida: enquanto não houver
domínio próprio, todo deploy falha para "não coleta e não gasta". Ligar a
produção exige mudar `app/endpoints.js` **e** construir os dois fluxos n8n.

## ⚠️ Antes de virar produção

Quatro coisas bloqueiam, e estão no `README.md` do repo do cliente:

1. **Validação fiscal** dos números com a Cirlei.
2. **Ano-base e base legal** da tabela de IRPF (há um `TODO` no rodapé).
3. **Os dois fluxos n8n** (chat e lead) — especificados, não construídos.
4. **Domínio definitivo** e a troca em `endpoints.js`.

## Proteção

Repositório **privado**. `noindex` na meta e no cabeçalho `X-Robots-Tag`,
mais `robots.txt` — link de validação não entra em busca.

Quando os fluxos entrarem no ar, esta página passa a coletar nome, e-mail e
WhatsApp. A partir daí valem as regras de dado pessoal do workspace: retenção de
lead 24 meses, e pedido de exclusão tem que chegar ao destino final (planilha e,
depois, banco), não só ao CRM.

---

Origem: `clientes/cliente-master-academy/3-produto-escalavel/calculadora-reforma-tributaria`
Impressão do conteúdo publicado: `5b869d2b4dc02117`
