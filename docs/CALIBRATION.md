# Calibração — o passado julgando o modelo

> Fonte: §26 e §27 de [DEFINICOES_METRICAS.md](DEFINICOES_METRICAS.md); §33, §43 e §59 de
> [SPEC.md](SPEC.md).
> Motor: `packages/engine/src/calibration/` · API: `apps/api/src/modules/calibration/` ·
> Tela: `/calibration`.

## 1. O que é, em uma frase

Os pesos das dez métricas começaram como um palpite informado — alguém decidiu que chamado crítico
vale 18 % e reunião desmarcada vale 5 %. **Calibrar é conferir esse palpite contra o que já
aconteceu**: rodar o modelo mês a mês no passado e perguntar, para cada cliente que acabou
cancelando, se o sistema teria levantado a mão a tempo.

O resultado responde três perguntas que peso nenhum responde sozinho:

1. **Ele avisou?** — quantas saídas tiveram alerta dentro da janela.
2. **Ele avisou à toa?** — quantos alertas não viraram saída nenhuma.
3. **Avisou com quanta antecedência?** — quanto tempo antes veio o primeiro alerta.

E então propõe pesos melhores. **A proposta não é aplicada sozinha**: ela vira um rascunho de
versão, que só passa a valer quando alguém o ativa (§32).

## 2. A regra de ouro: nada de vazamento

§27 e §59 dizem a mesma coisa de dois jeitos: **ao avaliar o período `t`, usar apenas o que era
conhecido até `t`**. O campo de cancelamento é alvo de validação, jamais entrada do score.

Como o motor garante isso:

- a saúde de cada período vem das fotos (`metric_score_snapshots`), que foram calculadas com os
  valores daquele período e dos anteriores — nunca dos posteriores;
- o status do cliente e a data de saída **não entram** em nenhum cálculo de saúde, risco ou
  prioridade: entram só na hora de decidir se um alerta acertou;
- os períodos a partir da saída são descartados — depois de cancelar, o cliente não está mais na
  carteira e não há nada a prever;
- há um teste que prova a regra: ele calcula o resultado de uma série, acrescenta períodos futuros
  com dados catastróficos e verifica que as linhas até `t` ficaram idênticas
  (`backtest.test.ts`, "REGRA DE OURO").

## 3. Como o backtest funciona

### 3.1 A grade de períodos

Todos os fins de período de todos os clientes, mais as datas de saída, formam uma grade única e
ordenada. Sem ela, "um mês antes" significaria coisas diferentes para clientes com buracos na
série.

### 3.2 O que conta como alerta

Um cliente está "alertado" no período `t` quando o **risco** daquele período é maior ou igual ao
limiar. O padrão é **41**, ou seja, saúde de 59 para baixo — as faixas Risco e Crítico de §2. O
limiar é configurável por execução (`alertRiskThreshold`), e a mesma régua vale para os dois
backtests de uma execução.

### 3.3 O que conta como acerto

A janela (30, 60 ou 90 dias) vira 1, 2 ou 3 períodos mensais. O par (cliente, período `t`) é
**positivo** quando o cliente cancelou entre 1 e `windowPeriods` períodos depois de `t`.

|                        | Cancelou na janela | Não cancelou na janela |
| ---------------------- | ------------------ | ---------------------- |
| **O modelo alertou**   | acerto (TP)        | alarme falso (FP)      |
| **O modelo silenciou** | passou batido (FN) | silêncio correto (TN)  |

### 3.4 A saúde é recalculada, não lida

O backtest recompõe a saúde de cada período a partir da saúde por métrica e dos pesos avaliados
(§18: `soma(saúde × peso) / soma(peso disponível)`). É o que permite medir uma proposta de pesos
sobre o mesmo histórico — comparação entre iguais. Quando um período não tem métrica alguma
avaliável, ele fica de fora: sem dado não há previsão a julgar.

## 4. As métricas de avaliação

§26 é explícito: **nunca só accuracy**. Com 22 saídas em 80 clientes e 18 meses, dizer "ninguém
cancela" acertaria mais de 98 % dos meses e não serviria para nada.

| Indicador               | Fórmula                   | O que responde                                                          |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------- |
| `churnsAnalyzed`        | saídas com histórico      | A base de tudo. Sem ela, os outros números não têm significado.         |
| `churnDetectionRate`    | saídas pegas ÷ analisadas | **"Ele avisou?"** — a leitura de quem gere a carteira.                  |
| `precision`             | TP ÷ (TP + FP)            | **"Ele avisou à toa?"** — de cada 100 alertas, quantos viraram saída.   |
| `recall`                | TP ÷ (TP + FN)            | Dos meses que antecederam uma saída, em quantos houve alerta.           |
| `falsePositiveRate`     | FP ÷ (FP + TN)            | Quanto do "tudo bem" virou alarme. Alto demais, a fila perde o crédito. |
| `leadTime`              | média e mediana           | Meses entre o **primeiro** alerta e a saída, entre as saídas pegas.     |
| `precisionAt5` / `At10` | acertos ÷ vagas do topo   | O acerto no que a equipe realmente olha: o topo da fila de prioridade.  |
| `f1`                    | harmônica de P e R        | Um número só, para comparar duas propostas.                             |

Notas de leitura:

- **`recall` e `churnDetectionRate` não são a mesma coisa.** O primeiro conta pares
  (cliente, mês); o segundo conta clientes. Um cancelamento avisado nos três meses anteriores
  conta três vezes no primeiro e uma no segundo. A tela mostra o segundo em destaque, porque é o
  que responde "ele avisou?", e o primeiro na letra miúda.
- **`precision@N` tem teto.** Em um mês com dois clientes prestes a sair, o topo 5 não pode
  acertar mais que 2 de 5 — 40 %. Por isso a execução devolve também `maxPrecision`, a melhor
  fila possível naquele recorte. Comparar o valor com 100 % seria injusto com o modelo.
- **`leadTime` é medido a partir do primeiro alerta de toda a série**, não do primeiro alerta
  dentro da janela. Se contássemos só dentro da janela, o lead time seria sempre igual ao tamanho
  dela e não informaria nada. Só entram na média as saídas que o modelo pegou.

## 5. A sugestão de pesos (modo Assistido)

§25 diz que o modo preferencial é o **Assistido**: o sistema sugere, a empresa aprova.

### 5.1 Importância histórica

Uma métrica vale mais quanto melhor ela tiver **separado**, no passado, quem cancelou de quem
ficou. A separação é o **d de Cohen** entre dois grupos:

- grupo A: a saúde daquela métrica nos períodos que antecederam uma saída (os pares positivos);
- grupo B: a saúde nos demais períodos.

```text
separação = max(0, (média(B) − média(A)) / desvio_padrão_combinado)
```

O `max(0, …)` existe porque esperamos saúde **menor** em quem cancelou. Uma métrica em que os que
saíram estavam melhores não é sinal de saída — é ruído com sinal trocado, e recebe separação zero.

As separações normalizadas para somar 1 são a **importância histórica** de cada métrica.

Por que não "a métrica que mais caiu": queda grande numa métrica que caiu para todo mundo não
distingue ninguém. Separação mede distinção, não movimento.

### 5.2 Duas salvaguardas

1. **Encolhimento.** A proposta anda só **metade do caminho** entre o peso de hoje e a importância
   histórica (`suggestionStrength`, padrão 0,5). Com poucas saídas na base, puxar o peso todo para
   o histórico seria confiar demais em pouca evidência.
2. **Piso.** Nenhuma métrica é zerada (`minimumWeight`, padrão 1 %). O modelo carrega uma leitura
   de negócio que o histórico curto não tem autoridade para apagar.

Sem separação nenhuma — por exemplo, quando não há cancelamento na base — a importância histórica
repete os pesos atuais e a proposta não muda nada. O passado não opinou.

### 5.3 Soma exata

Os pesos propostos são normalizados pelo **método do maior resto** com 4 casas, de modo que a soma
seja exatamente `1,0000`. Arredondar cada peso isoladamente deixaria a soma em 0,9999 e a ativação
da versão seria recusada (§32 exige 100 % cravados).

### 5.4 Impacto estimado

A execução roda o backtest **duas vezes** com a mesma grade, a mesma janela e o mesmo limiar: uma
com os pesos de hoje (`baseline`) e outra com os propostos (`proposed`). A diferença é o impacto
estimado.

**Ressalva honesta, também exibida na tela:** a proposta foi ajustada olhando justamente estes
cancelamentos, então ela tende a parecer melhor aqui do que seria com dados novos. O número serve
para comparar, não para prometer.

## 6. Aceitar uma sugestão

`POST /calibration/runs/:id/apply-suggestions` recebe os ids das métricas cujo peso foi aceito e
cria uma **nova versão em rascunho**:

- as métricas aceitas recebem exatamente o peso sugerido;
- as demais dividem o que sobrou, mantendo a proporção entre elas;
- o conjunto é normalizado para somar 100 %, de modo que o rascunho nasça ativável;
- **a versão ativa não é tocada.** Os scores continuam saindo dela até alguém ativar a nova em
  `/metric-models`.

## 7. Limites — o que estes números não são

1. **A base é pequena.** Vinte e poucos cancelamentos dão margem de erro larga: a diferença entre
   60 % e 70 % de detecção pode ser uma saída a mais ou a menos. Os números orientam a conversa
   sobre pesos; não decidem sozinhos.
2. **Os dados são os mesmos que geraram a proposta.** Não há conjunto de validação separado. Com
   mais histórico, o caminho é reservar os últimos meses para teste e calibrar só com o resto.
3. **Correlação não é causa.** Uma métrica com separação alta pode ser sintoma do mesmo problema
   que causou a saída, não a causa dela. A calibração ordena suspeitos; quem investiga é gente.
4. **O passado pode não se repetir.** Mudança de produto, de preço ou de time muda o que antecede
   uma saída. Calibração velha envelhece — vale reexecutar quando a carteira mudar de cara.
5. **O limiar de alerta é uma escolha, não um achado.** Baixá-lo pega mais saídas e gera mais
   alarme falso. A execução guarda o limiar usado justamente para essa escolha ficar explícita.
6. **Cliente sem histórico não é avaliado.** Quem cancelou no primeiro mês da base não tem passado
   para julgar e fica de fora de `churnsAnalyzed` — por isso esse número pode ser menor que o total
   de cancelados da carteira.

## 8. Rotas

```text
GET  /api/v1/calibration/versions                     versões com histórico gravado
POST /api/v1/calibration/runs                         roda o backtest (owner/admin)
GET  /api/v1/calibration/runs                         histórico de execuções
GET  /api/v1/calibration/runs/:id                     resultado completo
POST /api/v1/calibration/runs/:id/apply-suggestions   cria rascunho com os pesos aceitos (owner/admin)
```

Corpo de `POST /calibration/runs`:

```jsonc
{
  "windowDays": 90, // 30, 60 ou 90; padrão 90
  "metricModelVersionId": "…", // sem isso, a versão em vigor
  "alertRiskThreshold": 41, // risco a partir do qual conta como alerta
  "suggestionStrength": 0.5, // 0 = manter os pesos, 1 = ir até a importância histórica
}
```

A execução fica registrada em `calibration_runs` com os parâmetros usados e o resultado completo,
para que qualquer número desta tela possa ser refeito depois.
