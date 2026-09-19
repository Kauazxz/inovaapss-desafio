<#
.SYNOPSIS
    Sincroniza seu trabalho com o do grupo, na ordem segura.

.DESCRIPTION
    Como todo mundo commita direto na main, a ordem importa:
    commitar -> PUXAR o trabalho dos outros -> so entao ENVIAR o seu.
    Fazer nessa ordem e o que impede um de sobrescrever o outro.

.EXAMPLE
    ./sync.ps1
    ./sync.ps1 "feat: tela de login"
#>
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Mensagem
)

$ErrorActionPreference = 'Stop'

function Escreva($texto, $cor) { Write-Host $texto -ForegroundColor $cor }
function Titulo($texto) { Write-Host ""; Escreva "=== $texto ===" Cyan }

# --- 0. Estamos dentro de um repositorio? ---
git rev-parse --is-inside-work-tree *> $null
if (-not $?) {
    Escreva "ERRO: esta pasta nao e um repositorio Git." Red
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Titulo "Sincronizando a branch '$branch'"

# --- 1. Existe trabalho nao commitado? ---
$pendente = git status --porcelain
if ($pendente) {
    Escreva "Voce tem alteracoes que ainda nao foram commitadas:" Yellow
    git status --short
    Write-Host ""

    if ($Mensagem) {
        $msg = ($Mensagem -join ' ').Trim()
    }
    else {
        $msg = (Read-Host "Descreva o que voce fez (ex: feat: tela de login)").Trim()
    }

    if ([string]::IsNullOrWhiteSpace($msg)) {
        Escreva "Commit cancelado: a mensagem esta vazia. Nada foi enviado." Red
        exit 1
    }

    git add -A
    git commit -m $msg
    if (-not $?) { Escreva "ERRO ao commitar. Nada foi enviado." Red; exit 1 }
    Escreva "Commit criado." Green
}
else {
    Escreva "Nenhuma alteracao local pendente." Gray
}

# --- 2. PUXAR primeiro (rebase mantem o historico limpo) ---
Titulo "Puxando o trabalho do grupo"
git pull --rebase origin $branch
if (-not $?) {
    Write-Host ""
    Escreva "CONFLITO ao juntar seu codigo com o do grupo." Yellow
    Escreva "Seu trabalho NAO foi perdido. Faca assim:" Yellow
    Write-Host ""
    Write-Host "  1. Abra no VSCode os arquivos marcados com conflito"
    Write-Host "  2. Fale com quem escreveu a outra parte antes de apagar algo"
    Write-Host "  3. Resolva, e entao rode:  git add . ; git rebase --continue"
    Write-Host "  4. Por fim, rode ./sync.ps1 de novo"
    Write-Host ""
    Write-Host "  Quer desistir e voltar tudo como estava?  git rebase --abort"
    Write-Host ""
    Escreva "Detalhes em docs/COMO-TRABALHAR.md (secao 4)." Gray
    exit 1
}

# --- 3. So agora ENVIAR ---
Titulo "Enviando para o GitHub"
git push origin $branch
if (-not $?) {
    Write-Host ""
    Escreva "Nao foi possivel enviar." Red
    Escreva "Causa mais comum: sua conta ainda nao tem permissao de escrita no repositorio." Yellow
    Escreva "Peca para Kauazxz adicionar voce como colaborador em:" Yellow
    Write-Host "  https://github.com/Kauazxz/inovaapss/settings/access"
    Write-Host ""
    Escreva "Seu commit esta salvo na sua maquina - nada foi perdido." Gray
    exit 1
}

Write-Host ""
Escreva "Tudo sincronizado. Seu codigo esta no GitHub e voce tem o do grupo." Green
git --no-pager log --oneline -n 5
