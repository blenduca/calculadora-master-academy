# Calculadora da Reforma Tributária — Master Academy (cópia publicada)

> **GERADO. Não editar nada aqui à mão.** Esta pasta é montada por
> `clientes/cliente-master-academy/3-produto-escalavel/calculadora-reforma-tributaria/publicar.mjs`
> a partir do repo do cliente (privado, sem remote). Correção se faz na origem
> e republica — editar aqui cria drift silencioso.

## O que é

Simulador do impacto da Reforma Tributária na atividade rural. O produtor
informa quatro números e recebe a estimativa de Imposto de Renda, IBS/CBS e a
comparação entre os cinco cenários.

## ⚠️ Este site COLETA DADO PESSOAL

Em `calculadora-master-academy.vercel.app` (e no domínio próprio, quando
entrar) a página está **ligada**: assistente de conversa ativo, e cada
diagnóstico grava nome, e-mail e WhatsApp numa planilha do Google.

Qualquer outro host — preview de branch, `github.io` — entra em **modo de
aprovação**: cálculo real, assistente desligado, nenhum contato gravado. A lista
de hosts de produção está em `app/endpoints.js`; **domínio novo tem que ser
acrescentado lá**, senão nasce mudo.

**Retenção de lead: 24 meses.** Pedido de exclusão tem que chegar à planilha,
não só ao CRM.

## 🚨 Autoria do commit

A Vercel confere o **autor do commit** e, no plano Hobby, recusa qualquer autor
que não seja o dono do projeto (`Deployment was blocked...`). O deployment
falha e o botão **Redeploy** só reafirma o último build bem-sucedido — o site
fica no código velho sem erro visível.

Commit aqui tem que sair como **`suporte@blenduca.com.br`**. O config local
deste repo já garante isso; se ele for reclonado, refazer:

```bash
git config user.name  "suporte"
git config user.email "suporte@blenduca.com.br"
```

## Proteção

Repositório **privado**. `noindex` na meta e no cabeçalho `X-Robots-Tag`,
mais `robots.txt` — o link não entra em busca.

---

Origem: `clientes/cliente-master-academy/3-produto-escalavel/calculadora-reforma-tributaria`
Impressão do conteúdo publicado: `31602fdc75da80b1`
