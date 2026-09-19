#!/usr/bin/env node
/*
  Confere se todo arquivo em supabase/migrations/ segue o padrao da CLI do Supabase:
      YYYYMMDDHHMMSS_nome_em_minusculas.sql      ex.: 20260919120000_create_organizations.sql
  Pasta inexistente ou vazia: passa (ainda nao ha migrations).

  Uso: node scripts/verificar-migrations.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const PADRAO = /^[0-9]{14}_[a-z0-9_]+\.sql$/;
const pasta = path.join(__dirname, '..', 'supabase', 'migrations');

if (!fs.existsSync(pasta)) {
  console.log('supabase/migrations/ nao existe ainda: nada a conferir.');
  process.exit(0);
}

const arquivos = fs.readdirSync(pasta).filter((nome) => {
  return fs.statSync(path.join(pasta, nome)).isFile();
});

if (arquivos.length === 0) {
  console.log('supabase/migrations/ esta vazia: nada a conferir.');
  process.exit(0);
}

const invalidos = arquivos.filter((nome) => !PADRAO.test(nome));
if (invalidos.length > 0) {
  console.error('Migrations com nome fora do padrao YYYYMMDDHHMMSS_nome.sql:');
  for (const nome of invalidos) console.error('  - ' + nome);
  console.error('');
  console.error('Gere as migrations com "pnpm --filter @inovaapss/api db:generate" (drizzle-kit');
  console.error('com prefixo do Supabase) ou renomeie seguindo o padrao acima.');
  process.exit(1);
}

console.log(arquivos.length + ' migration(s) com nome valido.');
