# Configurador de modelos de métricas (Etapa 10)

Como montar um modelo do zero, versionar, ativar e o que acontece com o histórico. Regras na
[SPEC.md](SPEC.md) §31 (versionamento), §32 (modos de peso), §37 (rotas), §38 (telas) e §41
(configurador), e em [DEFINICOES_METRICAS.md](DEFINICOES_METRICAS.md) §25, §28, §31 e §32 — que
vence em caso de divergência.

Telas: `/metric-models` (lista) e `/metric-models/:id` (configurador).

---

## 1. Os três conceitos, que não se confundem

| Conceito    | O que é                                                                      | Onde se edita                      |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| **Métrica** | O indicador em si: nome, chave, tipo, unidade, direção, fonte, periodicidade | `/metrics` (Nova métrica / Editar) |
| **Modelo**  | O conjunto de métricas que calcula a saúde da carteira, com um modo de peso  | `/metric-models` (Novo modelo)     |
| **Versão**  | Uma fotografia do modelo: quais métricas, com que peso, faixa e gatilho      | `/metric-models/:id`               |

A mesma métrica pode valer 18 % numa versão e 12 % na seguinte. Por isso **peso, normalização,
faixas e gatilhos não ficam no cadastro da métrica**: ficam no item da versão.

## 2. Montar um modelo do zero

1. **Cadastre as métricas** em `/metrics` → **Nova métrica**. O formulário pede o cadastro mínimo
   do §31: nome, chave, descrição, categoria, tipo, unidade, direção, fonte, periodicidade e se
   está ativa. A chave é sugerida a partir do nome e é a identidade estável da métrica — é por ela
   que a importação liga as colunas da planilha.
   Uma sugestão aceita em `/documents` chega aqui já preenchida (botão **Revisar no formulário**).
2. **Crie o modelo** em `/metric-models` → **Novo modelo**: nome e **modo de peso** (§25).
   O modelo nasce sem versão.
3. **Crie a versão 1** no configurador. Ela nasce como rascunho vazio (ou como cópia da versão
   ativa, quando já existe uma).
4. **Adicione as métricas** pelo seletor "Adicionar métrica à versão" e distribua os pesos na
   coluna **Peso empresa**, digitando em porcentagem.
5. **Configure cada métrica** no botão de engrenagem: normalização, composição do score,
   tendência, persistência e gatilhos. **Simule** ali mesmo com uma série de valores.
6. **Salve o rascunho** e, com a soma em 100 % exatos, **ative a versão**.

## 3. Modos de peso (§25, §32)

| Modo           | Quem decide o peso                                                     |
| -------------- | ---------------------------------------------------------------------- |
| **Manual**     | A empresa digita cada peso.                                            |
| **Assistido**  | O sistema sugere, a empresa aprova. **É o modo preferido.**            |
| **Automático** | O sistema ajusta a partir da calibração; a empresa audita o resultado. |

O modo é escolhido ao criar o modelo e aparece na lista. Em qualquer modo, **a soma continua
sendo responsabilidade de quem ativa**: nenhuma versão entra em vigor sem 100 %.

## 4. A tabela do configurador (§41)

| Coluna            | O que mostra                                                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ativa**         | Se a métrica faz parte desta versão. Desmarcar a tira da versão e da soma.                                                                                                                                                                                                                                           |
| **Ordem**         | Ordem de exibição. Muda pelos botões ↑ e ↓ — acessíveis pelo teclado, sem arrastar.                                                                                                                                                                                                                                  |
| **Métrica**       | Nome e chave, com link para o cadastro.                                                                                                                                                                                                                                                                              |
| **Tipo**          | Tempo, Percentual, Quantidade, Financeiro, Nota…                                                                                                                                                                                                                                                                     |
| **Peso empresa**  | O peso digitado, em porcentagem. Editável direto na linha.                                                                                                                                                                                                                                                           |
| **Peso sugerido** | O peso que a **última calibração** (§26) deste modelo propôs para a métrica. Quando há uma proposta de redistribuição na tela, ela tem precedência, porque é a ação em curso. Sem nenhuma das duas, "—". O rodapé da tabela diz de qual das duas veio o número, a data e a janela. Ver `calibration-suggestions.ts`. |
| **Peso final**    | O que realmente entra na conta. Métrica desativada não soma e aparece como "—".                                                                                                                                                                                                                                      |
| **Direção**       | Maior é melhor, maior é pior ou faixa-alvo.                                                                                                                                                                                                                                                                          |
| **Normalização**  | A estratégia do §9 usada para virar health 0–100.                                                                                                                                                                                                                                                                    |
| **Status**        | Entra nesta versão, Peso alterado, Sem mudança, Fora desta versão, Desativada.                                                                                                                                                                                                                                       |

A **soma dos pesos fica visível o tempo todo**, acima da tabela, e é destacada enquanto for
diferente de 100 %. É a mesma conta que a API faz ao ativar (`validateVersionWeights`): entram só
as métricas incluídas na versão **cuja definição está ativa**.

## 5. Redistribuir pesos nunca é silencioso (§41)

O botão **Redistribuir pesos** chama `POST /metric-models/:id/rebalance`, que devolve uma
**proposta** com `saved: false` — a API não grava nada. A tela mostra peso atual, peso proposto e
a diferença em pontos percentuais de cada métrica, e só então aparecem **Aplicar ao rascunho** e
**Descartar proposta**. Aplicar muda apenas o rascunho: a versão ativa segue intacta até alguém
ativar a nova.

A proposta mantém a proporção entre os pesos atuais e joga o resíduo do arredondamento no maior
peso, para fechar exatamente 1,0000 (quatro casas, como o `numeric(6,4)` do banco).

## 6. Ativar uma versão

**Ativar não é salvar.** Salvar mexe no rascunho; ativar troca o modelo que pontua **toda a
organização** — os 80 clientes de uma vez, não um cliente só. Por isso:

- o botão só habilita com os pesos em **100 % exatos** (a API valida de novo e responde
  `WEIGHTS_MUST_SUM_100` se não fecharem);
- antes de confirmar, a tela mostra **o que muda** em relação à versão em vigor: métricas que
  entram, que saem, pesos que mudam e configurações que mudam;
- a versão ativa anterior é **arquivada**, nunca apagada.

## 7. O que acontece com o histórico (§32)

Esta é a regra que o produto não pode quebrar:

> Alterar peso, faixa ou fórmula **não apaga a configuração anterior**, e cada score histórico
> sabe qual versão o gerou.

Como isso se sustenta:

- `metric_model_versions` guarda todas as versões. Ativada ou arquivada, uma versão é
  **imutável**: o configurador a abre só para leitura e para comparação.
- Todo snapshot (`client_score_snapshots` e `metric_score_snapshots`) grava
  `metric_model_version_id`. A chave única inclui a versão, então v1 e v2 convivem para o mesmo
  cliente e o mesmo período.
- O recálculo (`recalculateOrganization`) **só reescreve as fotos da versão que está calculando**.
  Recalcular com a v2 gera as fotos da v2 e preserva as da v1.

O painel lê sempre a versão ativa, então a experiência não muda — mas nada do passado se perde, e
a calibração continua podendo comparar o modelo da época com os cancelamentos que realmente
aconteceram.

Depois de ativar uma versão, os scores históricos **ainda são os da versão anterior** até que o
recálculo rode:

```bash
pnpm --filter @inovaapss/api recalculate
```

## 8. Estratégias de normalização (§9)

O painel lateral tem uma forma de campos por estratégia, validada pelos mesmos schemas Zod que a
API usa (`@inovaapss/validation`), então o que a tela aceita é o que o banco aceita.

| Estratégia             | Campos                                                                      |
| ---------------------- | --------------------------------------------------------------------------- |
| **THRESHOLD_BANDS**    | Faixas crescentes `até → health`; a última com o limite em branco (`null`). |
| **LINEAR_RANGE**       | Mínimo, máximo e faixa-alvo opcional.                                       |
| **RATIO_TO_TARGET**    | Meta, ponto onde zera (× a meta), tolerância, desvio que zera.              |
| **BASELINE_DEVIATION** | Janela, histórico mínimo, método, tolerância, desvio que zera, outlier.     |
| **BOOLEAN_MAP**        | Health para sim e para não.                                                 |
| **SCORE_MAP**          | Categoria → health, e o health de categoria fora do mapa.                   |
| **CUSTOM_SAFE_RULE**   | JSON da regra, validado pela allowlist de operadores (nunca `eval`).        |

Campo em branco é campo **ausente**, nunca zero: um limite que ninguém preencheu não pode virar
"limite zero".

## 9. Gatilhos críticos (§22, §27)

Peso contribui para o score; **gatilho gera ação imediata**. Cada gatilho tem identificador,
nome, severidade, mensagem e um piso de prioridade opcional, e pode ser:

- **Limite** — `value`, `health` ou `extra.<campo>` comparado a um número;
- **Sequência** — o limite batido por N períodos seguidos;
- **Regra JSON Logic segura** — para o que não cabe nos dois anteriores.

No recálculo, cada gatilho que dispara no período mais recente vira um alerta em `/alerts`.

## 10. Rotas usadas pela tela (§37)

```text
GET   /api/v1/metric-models                                  lista
POST  /api/v1/metric-models                                  novo modelo (owner/admin)
GET   /api/v1/metric-models/:id                              modelo + versões com itens
POST  /api/v1/metric-models/:id/versions                     rascunho (cópia da ativa sem body)
PATCH /api/v1/metric-models/:id/versions/:version            salva o rascunho (só rascunho)
POST  /api/v1/metric-models/:id/versions/:version/activate   ativa (exige 100 %)
POST  /api/v1/metric-models/:id/rebalance                    proposta, nunca salva
POST  /api/v1/metrics                                        nova métrica
PATCH /api/v1/metrics/:id                                    edita o cadastro
POST  /api/v1/metrics/:id/preview-score                      "Simular"
```

## 11. Perguntas que aparecem sempre

**Mudei um peso. Vale para quem?** Para a organização inteira, a partir da ativação. O modelo
pertence à organização, não ao cliente.

**Perco o histórico?** Não. A versão anterior é arquivada e os scores que ela gerou continuam
apontando para ela.

**Por que não consigo editar a versão ativa?** Porque ela é imutável (§32). Use **Nova versão a
partir da ativa**: o rascunho nasce com a configuração de hoje e você mexe nele à vontade.

**Por que o botão de ativar está desabilitado?** Ou a soma não fecha 100 %, ou há alterações não
salvas no rascunho. A frase sob a soma diz quanto falta ou quanto sobra.

**Uma métrica desativada atrapalha a soma?** Não. Ela sai do cálculo e do total — a coluna **Peso
final** mostra "—" para ela.
