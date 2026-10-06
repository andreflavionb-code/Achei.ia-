#!/bin/bash
# Achei - Dê duplo clique neste arquivo no macOS para atualizar e iniciar.
# Ele entra sozinho na pasta do projeto, então funciona de qualquer lugar.

cd "$(dirname "$0")"

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
    npm install
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

# Encerra servidor antigo na porta 3000, se houver
OLD=$(lsof -ti tcp:3000 2>/dev/null)
if [ -n "$OLD" ]; then
    echo "Encerrando servidor anterior na porta 3000..."
    kill $OLD 2>/dev/null
    sleep 1
fi

echo "Servidor iniciando em: http://localhost:3000"
echo "Pressione Ctrl+C para parar."
echo ""

# Abre o navegador quando o servidor responder
( for i in $(seq 1 60); do
    if curl -s -o /dev/null http://localhost:3000/api/status; then open "http://localhost:3000"; exit 0; fi
    sleep 1
  done ) &

npm run dev
