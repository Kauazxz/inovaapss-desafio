/*
  Testes do hook pre-commit de autoria (scripts/verificar-autor.js).
  Roda com `node --test scripts/verificar-autor.test.js` (faz parte do `pnpm test` da raiz).
  Usa GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL para nao depender da configuracao local do git.
*/
'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const SCRIPT = path.join(__dirname, 'verificar-autor.js');

function rodar(nome, email) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: nome, GIT_AUTHOR_EMAIL: email },
  });
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

test('aceita a identidade do projeto', () => {
  const r = rodar('Kauazxz', '122256165+Kauazxz@users.noreply.github.com');
  assert.equal(r.codigo, 0);
  assert.match(r.saida, /Autor do commit OK/);
});

test('aceita o e-mail com letras em outra caixa', () => {
  assert.equal(rodar('Kauazxz', '122256165+kauazxz@users.noreply.GitHub.com').codigo, 0);
});

test('recusa outra identidade e explica como configurar', () => {
  const r = rodar('Outra Pessoa', 'outra@example.com');
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /COMMIT RECUSADO/);
  assert.match(r.saida, /git config user\.email "122256165\+Kauazxz@users\.noreply\.github\.com"/);
  assert.match(r.saida, /COMECAR-AQUI/);
});

test('recusa nome certo com e-mail errado', () => {
  assert.equal(rodar('Kauazxz', 'kaua@example.com').codigo, 1);
});
