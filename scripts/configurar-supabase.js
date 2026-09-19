#!/usr/bin/env node
/*
  Configura o deploy automatico no Supabase. Roda UMA vez, por UMA pessoa.

  Pede 3 valores (sem mostrar na tela), guarda como segredos criptografados no
  GitHub, dispara o workflow "Deploy no Supabase" e acompanha ate ficar verde.
  Nada do que voce cola fica salvo neste computador.

  Uso:  npm run configurar-supabase
        npm run configurar-supabase -- --verificar   (so confere os segredos e roda o deploy)
*/
'use strict';
const { spawnSync } = require('child_process');

const cor = { verde: '\x1b[32m', amarelo: '\x1b[33m', vermelho: '\x1b[31m', ciano: '\x1b[36m', cinza: '\x1b[90m', fim: '\x1b[0m' };
const diga = (txt, c = '') => console.log(c + txt + (c ? cor.fim : ''));
const titulo = (txt) => { console.log(''); diga(`=== ${txt} ===`, cor.ciano); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function gh(args, opts = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

// Le uma linha do teclado sem mostrar nada na tela (aceita colar com Ctrl+V ou botao direito).
function perguntaOculta(texto) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(texto);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let valor = '';
    const fim = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', aoDigitar); process.stdout.write('\n'); resolve(valor.trim()); };
    const aoDigitar = (pedaco) => {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n') return fim();
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }         // Ctrl+C
        if (ch === '\u007f' || ch === '\b') { valor = valor.slice(0, -1); continue; } // Backspace
        valor += ch;
      }
    };
    stdin.on('data', aoDigitar);
  });
}

// Aceita o ref puro (20 letras), a URL do painel ou a URL da API; devolve so o ref.
function extraiRef(v) {
  v = v.trim();
  if (/^[a-z]{20}$/.test(v)) return v;
  const m = v.match(/project\/([a-z]{20})/) || v.match(/^https?:\/\/([a-z]{20})\.supabase\.co/);
  return m ? m[1] : null;
}

const SEGREDOS = [
  { nome: 'SUPABASE_ACCESS_TOKEN',
    pergunta: 'Access Token (comeca com sbp_): ',
    valida: (v) => (/^sbp_[0-9a-f]{20,}$/i.test(v.trim()) ? v.trim() : null),
    dica: 'Pegue em https://supabase.com/dashboard/account/tokens -> Generate new token. Comeca com "sbp_".' },
  { nome: 'SUPABASE_PROJECT_ID',
    pergunta: 'Project ref (ou cole a URL do painel do projeto): ',
    valida: extraiRef,
    dica: 'E o codigo de 20 letras na URL: supabase.com/dashboard/project/<codigo>. Pode colar a URL inteira.' },
  { nome: 'SUPABASE_DB_PASSWORD',
    pergunta: 'Senha do banco (Database Password): ',
    valida: (v) => (v.trim().length > 0 ? v.trim() : null),
    dica: 'A senha escolhida ao criar o projeto. Esqueceu? Project Settings -> Database -> Reset database password.' },
];

async function main() {
  const soVerificar = process.argv.includes('--verificar');

  titulo('Conta do GitHub');
  const quem = gh(['api', 'user', '--jq', '.login']);
  if (!quem.ok) { diga('Voce nao esta logado no GitHub. Rode:  gh auth login', cor.vermelho); return 1; }
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (!repo.ok) { diga('Esta pasta nao esta ligada a um repositorio do GitHub.', cor.vermelho); return 1; }
  diga(`Logado como ${quem.out}. Repositorio: ${repo.out}`, cor.cinza);

  const lista = gh(['secret', 'list', '--json', 'name', '--jq', '.[].name']);
  const existentes = new Set(lista.ok ? lista.out.split('\n').filter(Boolean) : []);

  if (soVerificar) {
    const faltam = SEGREDOS.map((s) => s.nome).filter((n) => !existentes.has(n));
    if (faltam.length) {
      diga(`Faltam segredos no GitHub: ${faltam.join(', ')}`, cor.vermelho);
      diga('Rode:  npm run configurar-supabase', cor.cinza);
      return 1;
    }
    diga('Os 3 segredos existem no GitHub.', cor.verde);
  } else {
    if (!process.stdin.isTTY) { diga('Rode este comando num terminal de verdade (ele precisa esconder o que voce digita).', cor.vermelho); return 1; }
    titulo('Os 3 segredos do Supabase');
    diga('O que voce colar nao aparece na tela nem fica salvo neste computador.', cor.cinza);
    diga('Onde pegar cada um: docs/SUPABASE.md, secao "Configurar uma vez".', cor.cinza);
    for (const s of SEGREDOS) {
      console.log('');
      const jaTem = existentes.has(s.nome);
      if (jaTem) diga(`${s.nome} ja existe no GitHub. Cole o valor novo, ou so Enter para manter.`, cor.amarelo);
      let valor = null;
      while (!valor) {
        const bruto = await perguntaOculta(`${s.nome}\n  ${s.pergunta}`);
        if (!bruto && jaTem) { diga('  mantido o valor atual.', cor.cinza); break; }
        valor = s.valida(bruto);
        if (!valor) diga(`  Isso nao parece certo. ${s.dica}`, cor.amarelo);
      }
      if (valor) {
        const r = gh(['secret', 'set', s.nome], { input: valor });   // vai por stdin, nunca pela linha de comando
        if (!r.ok) { diga(`  ERRO ao salvar ${s.nome}: ${r.err}`, cor.vermelho); return 1; }
        diga(`  ${s.nome} salvo no GitHub.`, cor.verde);
      }
    }
  }

  titulo('Testando o deploy de verdade');
  const antes = Date.now() - 5000;
  const disparo = gh(['workflow', 'run', 'deploy-supabase.yml', '--ref', 'main']);
  if (!disparo.ok) { diga(`Nao consegui disparar o workflow: ${disparo.err}`, cor.vermelho); return 1; }
  diga('Workflow disparado no GitHub. Aguardando ele aparecer...', cor.cinza);

  let id = null;
  for (let i = 0; i < 12 && !id; i++) {
    await espera(5000);
    const l = gh(['run', 'list', '--workflow', 'deploy-supabase.yml', '--limit', '3', '--json', 'databaseId,createdAt']);
    if (!l.ok || !l.out) continue;
    const novo = JSON.parse(l.out).find((r) => new Date(r.createdAt).getTime() >= antes);
    if (novo) id = String(novo.databaseId);
  }
  if (!id) { diga('O workflow nao apareceu em 1 minuto. Veja na aba Actions do GitHub.', cor.amarelo); return 1; }

  const watch = spawnSync('gh', ['run', 'watch', id, '--exit-status', '--interval', '5'], { stdio: 'inherit' });
  console.log('');
  if (watch.status === 0) {
    diga('DEPLOY VERDE. O GitHub conseguiu entrar no seu projeto do Supabase.', cor.verde);
    diga('A partir de agora, todo push que mexer em supabase/ e aplicado sozinho.', cor.cinza);
    return 0;
  }
  diga('O deploy falhou. As linhas com erro:', cor.vermelho);
  spawnSync('gh', ['run', 'view', id, '--log-failed'], { stdio: 'inherit' });
  console.log('');
  diga('Causas mais comuns: senha do banco errada, token errado, ou o projeto ainda esta sendo criado (espere 2 min).', cor.amarelo);
  diga('Corrigiu? Rode de novo:  npm run configurar-supabase', cor.cinza);
  return 1;
}

main().then((codigo) => process.exit(codigo));
