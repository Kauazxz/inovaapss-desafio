#!/usr/bin/env node
/*
  Hook commit-msg: confere a mensagem do commit antes de aceitar.

  Regras deste repositorio:
    1. Primeira linha em Conventional Commits, em ingles:
         tipo(escopo): descricao        ex.: feat(auth): add login page
       Tipos aceitos: feat fix chore docs style refactor perf test build ci revert
       Tambem aceita linhas que comecam com "Merge ", "Revert ", "fixup! " ou "squash! ".
    2. Um unico autor. Nenhuma linha pode comecar com "Co-Authored-By:" ou
       "Signed-off-by:", nem conter "Generated with" ou o emoji de robo.

  Uso: node scripts/verificar-commit.js <arquivo-com-a-mensagem>
*/
'use strict';
const fs = require('fs');

const TIPOS = 'feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert';
// tipo(escopo)!: descricao  -> escopo e "!" (breaking change) sao opcionais
const PRIMEIRA_LINHA =
  /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([a-z0-9._/-]+\))?!?: .{3,}$/;
const EXCECOES = /^(Merge |Revert |fixup! |squash! )/;

const TRAILERS_PROIBIDOS = [
  { teste: (l) => /^co-authored-by:/i.test(l), nome: 'Co-Authored-By' },
  { teste: (l) => /^signed-off-by:/i.test(l), nome: 'Signed-off-by' },
  { teste: (l) => /generated with/i.test(l), nome: '"Generated with"' },
  { teste: (l) => l.includes('\u{1F916}'), nome: 'emoji de robo' },
];

function falha(motivo, linha) {
  console.error('');
  console.error('COMMIT RECUSADO: ' + motivo);
  if (linha !== undefined) console.error('  Linha: ' + JSON.stringify(linha));
  console.error('');
  console.error('Formato esperado na primeira linha:  tipo(escopo): descricao');
  console.error('  Tipos: ' + TIPOS.split('|').join(', '));
  console.error('  Exemplo: feat(clients): add portfolio client list');
  console.error('');
  console.error('Os commits deste repositorio tem sempre um unico autor e nao aceitam');
  console.error('trailers de coautoria nem mencoes a ferramentas de geracao.');
  console.error('Refaca a mensagem sem o trecho apontado e tente de novo.');
  console.error('');
  process.exit(1);
}

function lerMensagem(caminho) {
  if (!caminho) falha('caminho do arquivo da mensagem nao informado.');
  let conteudo;
  try {
    conteudo = fs.readFileSync(caminho, 'utf8');
  } catch {
    falha('nao foi possivel ler o arquivo ' + caminho);
  }
  return conteudo
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !l.startsWith('#')); // linhas de comentario do git
}

function verificar(linhas) {
  const primeira = linhas.find((l) => l.trim() !== '');
  if (primeira === undefined) falha('mensagem vazia.');
  const cabecalho = primeira.trim();
  if (!PRIMEIRA_LINHA.test(cabecalho) && !EXCECOES.test(cabecalho)) {
    falha('a primeira linha nao segue Conventional Commits.', cabecalho);
  }
  for (const linha of linhas) {
    const l = linha.trim();
    for (const regra of TRAILERS_PROIBIDOS) {
      if (regra.teste(l)) falha('encontrado ' + regra.nome + ', que nao e permitido aqui.', l);
    }
  }
}

verificar(lerMensagem(process.argv[2]));
console.log('Mensagem de commit OK.');
