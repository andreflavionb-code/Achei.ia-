#!/bin/bash
# Achei - Dê duplo clique neste arquivo no macOS para atualizar e iniciar.
# Ele entra sozinho na pasta do projeto, então funciona de qualquer lugar.

cd "$(dirname "$0")"

# Alguns Macs têm NODE_ENV=production definido no sistema; isso pula pacotes
# de desenvolvimento e confunde o Next. Aqui forçamos o modo de desenvolvimento.
export NODE_ENV=development

echo ""
echo "╔══════════════════════════════════════╗"
echo "║           Achei - Iniciando          ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Pasta do projeto: $(pwd)"
echo ""

if ! command -v node &> /dev/null; then
    echo "Node.js não encontrado. Instale em: https://nodejs.org"
    read -p "Pressione Enter para fechar..."
    exit 1
fi

# Atualiza o código (ignora erro se estiver sem internet)
echo "Atualizando o código..."
git pull --ff-only origin main 2>/dev/null || echo "(não foi possível atualizar; seguindo com a versão local)"
echo ""

# Instala dependências quando o package.json mudou ou na primeira vez
if [ ! -d "node_modules" ] || [ package.json -nt node_modules/.package-lock.json ]; then
    echo "Instalando dependências..."
    npm install --include=dev
    echo ""
fi

# Chromium do navegador invisível
if ! npx playwright install --dry-run chromium 2>/dev/null | grep -q "is already installed"; then
    if [ ! -d "$HOME/Library/Caches/ms-playwright" ] || [ -z "$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-* 2>/dev/null)" ]; then
        echo "Baixando o Chromium (uma vez, pode levar alguns minutos)..."
        npm run browser:install
        echo ""
    fi
fi

# Arquivo .env e banco
[ -f .env ] || cp .env.example .env
echo "Verificando banco de dados..."
npm run db:push --silent
echo ""

# Encerra servidores antigos do PRÓPRIO Achei (next dev rodando nesta pasta).
# Outros programas na porta 3000 não são tocados.
for pid in $(pgrep -f "next dev" 2>/dev/null); do
    if lsof -p "$pid" 2>/dev/null | grep -q "$(pwd)"; then
        echo "Encerrando servidor anterior do Achei (processo $pid)..."
        kill "$pid" 2>/dev/null
    fi
done
sleep 1

# Escolhe uma porta livre (não derruba outros programas que estejam na 3000)
PORT=3000
for candidate in 3000 3010 3020 3030; do
    if ! lsof -ti tcp:$candidate >/dev/null 2>&1; then PORT=$candidate; break; fi
done

echo "Servidor iniciando em: http://localhost:$PORT"
echo "Mercado Livre, Magalu e Casas Bahia são lidos por um Chrome escondido fora da tela (não aparece janela)."
echo "Pressione Ctrl+C para parar."
echo ""

# Abre o navegador quando o servidor responder
( for i in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:$PORT/api/status"; then open "http://localhost:$PORT"; exit 0; fi
    sleep 1
  done ) &

npx next dev -p "$PORT"
