#!/usr/bin/env node
/*
  Hook pre-commit: confere que o commit vai sair pela conta do projeto (ajuste A6 da spec).

  Todo commit deste repositorio tem um unico autor, Kauazxz. Quem clona e esquece a Parte 3
  do COMECAR-AQUI (git config user.name / user.email SEM --global) commitaria com a identidade
  global da propria maquina; este script transforma o esquecimento em erro claro.

  Respeita GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL quando definidos (e como o git faz).

  Uso: node scripts/verificar-autor.js
*/
'use strict';
const { spawnSync } = require('child_process');

const NOME_ESPERADO = 'Kauazxz';
const EMAIL_ESPERADO = '122256165+Kauazxz@users.noreply.github.com';

function gitConfig(chave) {
  const r = spawnSync('git', ['config', '--get', chave], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function identidade(env) {
  return {
    nome: (env.GIT_AUTHOR_NAME || gitConfig('user.name')).trim(),
    email: (env.GIT_AUTHOR_EMAIL || gitConfig('user.email')).trim(),
  };
}

function conferir(env) {
  const { nome, email } = identidade(env);
  if (nome === NOME_ESPERADO && email.toLowerCase() === EMAIL_ESPERADO.toLowerCase()) {
    return { ok: true, nome, email };
  }
  return { ok: false, nome, email };
}

const resultado = conferir(process.env);
if (!resultado.ok) {
  console.error('');
  console.error('COMMIT RECUSADO: a identidade do Git nao e a do projeto.');
  console.error(
    '  Encontrado: ' + (resultado.nome || '(vazio)') + ' <' + (resultado.email || 'vazio') + '>',
  );
  console.error('  Esperado:   ' + NOME_ESPERADO + ' <' + EMAIL_ESPERADO + '>');
  console.error('');
  console.error('Configure a identidade do projeto (dentro da pasta, sem --global):');
  console.error('  git config user.name "' + NOME_ESPERADO + '"');
  console.error('  git config user.email "' + EMAIL_ESPERADO + '"');
  console.error('(docs/COMECAR-AQUI.md, Parte 3) e tente o commit de novo.');
  console.error('');
  process.exit(1);
}
console.log('Autor do commit OK (' + NOME_ESPERADO + ').');
