/*
  Testes do hook commit-msg (scripts/verificar-commit.js).
  Roda com `node --test scripts/verificar-commit.test.js` (faz parte do `pnpm test` da raiz).
  Cada caso grava a mensagem num arquivo temporario e executa o script como o git faria.
*/
'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const SCRIPT = path.join(__dirname, 'verificar-commit.js');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-commit-'));

function verificar(mensagem) {
  const arquivo = path.join(pasta, 'msg-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  fs.writeFileSync(arquivo, mensagem, 'utf8');
  const r = spawnSync(process.execPath, [SCRIPT, arquivo], { encoding: 'utf8' });
  fs.unlinkSync(arquivo);
  return { codigo: r.status, saida: r.stdout + r.stderr };
}

test('aceita Conventional Commits com escopo e corpo em portugues', () => {
  const r = verificar('feat(auth): add login page\n\nTela de login com Supabase Auth.\n');
  assert.equal(r.codigo, 0);
  assert.match(r.saida, /Mensagem de commit OK/);
});

test('aceita Merge, Revert, fixup! e squash!', () => {
  for (const cabecalho of [
    'Merge branch main',
    'Revert "feat: x"',
    'fixup! feat: x',
    'squash! feat: x',
  ]) {
    assert.equal(verificar(cabecalho + '\n').codigo, 0, cabecalho);
  }
});

test('recusa primeira linha fora do Conventional Commits', () => {
  const r = verificar('teste\n');
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /nao segue Conventional Commits/);
});

test('recusa mensagem vazia', () => {
  assert.equal(verificar('\n\n').codigo, 1);
});

test('recusa trailers de coautoria em qualquer posicao da linha', () => {
  const casos = [
    'feat(x): add item\n\nCo-Authored-By: Alguem <a@b.c>\n',
    'feat(x): add item\n\nco-authored-by: alguem <a@b.c>\n',
    'feat(x): add item\n\n   Co-Authored-By: Alguem <a@b.c>\n',
    'feat(x): add item\n\nfoo Co-Authored-By: Alguem <a@b.c>\n',
    'feat(x): add item\n\nSigned-off-by: Alguem <a@b.c>\n',
    'feat(x): add item\n\nnota Signed-off-by: Alguem <a@b.c>\n',
  ];
  for (const msg of casos) {
    const r = verificar(msg);
    assert.equal(r.codigo, 1, msg);
    assert.match(r.saida, /COMMIT RECUSADO/);
  }
});

test('recusa "Generated with" e o emoji de robo', () => {
  assert.equal(verificar('feat(x): add item\n\nGenerated with Ferramenta\n').codigo, 1);
  assert.equal(verificar('feat(x): add item \u{1F916}\n').codigo, 1);
});

test('recusa mencao a ferramenta de IA no corpo', () => {
  const casos = [
    'feat(x): add item\n\nfeito com ajuda do Claude\n',
    'feat(x): add item\n\nAssistant: ChatGPT\n',
    'feat(x): add item\n\nrevisado pelo Copilot\n',
    'feat(x): add item\n\nsugestao do GPT-4\n',
    'feat(x): add item\n\ngerado por um AI assistant\n',
    'feat(x): add item\n\ngerado por um assistente de IA\n',
  ];
  for (const msg of casos) {
    const r = verificar(msg);
    assert.equal(r.codigo, 1, msg);
    assert.match(r.saida, /ferramenta de IA/);
  }
});

test('nao confunde nomes de variaveis de ambiente com mencao a ferramenta', () => {
  assert.equal(verificar('feat(env): add ANTHROPIC_API_KEY placeholder\n').codigo, 0);
});

test('aceita CRLF e ignora linhas de comentario do git', () => {
  const r = verificar('feat(x): add item\r\n\r\n# Please enter the commit message\r\n');
  assert.equal(r.codigo, 0);
});
