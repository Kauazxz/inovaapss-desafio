#!/usr/bin/env node
/*
  Sincroniza seu trabalho com o do grupo, na ordem segura:

      commita o seu  ->  PUXA o dos outros  ->  so entao ENVIA o seu

  Fazer nessa ordem e o que impede um de sobrescrever o outro.
  Funciona em Windows, Mac e Linux. Precisa so do Git e do Node.

  Uso:  pnpm sync
        pnpm sync "feat: tela de login"
*/
'use strict';
const { spawnSync } = require('child_process');
const readline = require('readline');

const cor = { verde: '\x1b[32m', amarelo: '\x1b[33m', vermelho: '\x1b[31m', ciano: '\x1b[36m', cinza: '\x1b[90m', fim: '\x1b[0m' };
const diga = (txt, c = '') => console.log(c + txt + (c ? cor.fim : ''));
const titulo = (txt) => { console.log(''); diga(`=== ${txt} ===`, cor.ciano); };

// roda o git mostrando a saida na tela; devolve o codigo de saida
function roda(args) {
  const r = spawnSync('git', args, { stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}
// roda o git em silencio; devolve a saida como texto
function saida(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function pergunta(texto) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve('');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, (resp) => { rl.close(); resolve(resp.trim()); });
  });
}

async function main() {
  // --- 0. Estamos dentro de um repositorio? ---
  if (saida(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    diga('ERRO: esta pasta nao e um repositorio Git.', cor.vermelho);
    return 1;
  }
  const branch = saida(['rev-parse', '--abbrev-ref', 'HEAD']);
  titulo(`Sincronizando a branch '${branch}'`);

  // --- 1. Existe trabalho nao commitado? ---
  if (saida(['status', '--porcelain'])) {
    diga('Voce tem alteracoes que ainda nao foram commitadas:', cor.amarelo);
    roda(['status', '--short']);
    console.log('');
    let msg = process.argv.slice(2).join(' ').trim();
    if (!msg) msg = await pergunta('Descreva o que voce fez (ex: feat: tela de login): ');
    if (!msg) {
      diga('Commit cancelado: a mensagem esta vazia. Nada foi enviado.', cor.vermelho);
      diga('Dica: pnpm sync "feat: o que voce fez"', cor.cinza);
      return 1;
    }
    roda(['add', '-A']);
    if (roda(['commit', '-m', msg]) !== 0) {
      diga('ERRO ao commitar. Nada foi enviado.', cor.vermelho);
      return 1;
    }
    diga('Commit criado.', cor.verde);
  } else {
    diga('Nenhuma alteracao local pendente.', cor.cinza);
  }

  // --- 2. PUXAR primeiro (rebase mantem o historico limpo) ---
  titulo('Puxando o trabalho do grupo');
  if (roda(['pull', '--rebase', 'origin', branch]) !== 0) {
    console.log('');
    diga('CONFLITO ao juntar seu codigo com o do grupo.', cor.amarelo);
    diga('Seu trabalho NAO foi perdido. Faca assim:', cor.amarelo);
    console.log('');
    console.log('  1. Abra no VSCode os arquivos marcados com conflito');
    console.log('  2. Fale com quem escreveu a outra parte antes de apagar algo');
    console.log('  3. Resolva, e entao rode:  git add .   e depois   git rebase --continue');
    console.log('  4. Por fim, rode  pnpm sync  de novo');
    console.log('');
    console.log('  Quer desistir e voltar tudo como estava?  git rebase --abort');
    console.log('');
    diga('Detalhes em docs/COMO-TRABALHAR.md (secao 4).', cor.cinza);
    return 1;
  }

  // --- 3. So agora ENVIAR ---
  titulo('Enviando para o GitHub');
  if (roda(['push', 'origin', branch]) !== 0) {
    console.log('');
    diga('Nao foi possivel enviar.', cor.vermelho);
    diga('Causa mais comum: voce ainda nao fez login (gh auth login) ou sua conta', cor.amarelo);
    diga('nao tem permissao de escrita no repositorio.', cor.amarelo);
    diga('Seu commit esta salvo na sua maquina - nada foi perdido.', cor.cinza);
    return 1;
  }

  console.log('');
  diga('Tudo sincronizado. Seu codigo esta no GitHub e voce tem o do grupo.', cor.verde);
  diga('Mexeu em supabase/? O deploy comeca sozinho - acompanhe na aba Actions do GitHub.', cor.cinza);
  roda(['--no-pager', 'log', '--oneline', '-n', '5']);
  return 0;
}

main().then((codigo) => process.exit(codigo));
