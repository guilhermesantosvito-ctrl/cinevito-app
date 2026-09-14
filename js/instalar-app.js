// =========================================================
// Instalação do app como PWA — sem aviso de "arquivo perigoso",
// sem pedir permissão de sistema. É só um ícone na tela inicial.
// =========================================================

let promptInstalacaoAdiado = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  promptInstalacaoAdiado = evento;
  mostrarBotaoInstalar();
});

window.addEventListener("appinstalled", () => {
  esconderBotaoInstalar();
});

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function jaInstalado() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function mostrarBotaoInstalar() {
  if (jaInstalado() || document.getElementById("botao-instalar-app")) return;

  const botao = document.createElement("div");
  botao.id = "botao-instalar-app";
  botao.className = "faixa-instalar";
  botao.innerHTML = `
    <span>📲 Instale o CineVito na sua tela inicial</span>
    <button onclick="acionarInstalacao()">Instalar agora</button>
    <button class="fechar-instalar" onclick="document.getElementById('botao-instalar-app').remove()">✕</button>
  `;
  document.body.insertBefore(botao, document.body.firstChild);
}

function esconderBotaoInstalar() {
  const el = document.getElementById("botao-instalar-app");
  if (el) el.remove();
}

async function acionarInstalacao() {
  if (!promptInstalacaoAdiado) return;
  promptInstalacaoAdiado.prompt();
  await promptInstalacaoAdiado.userChoice;
  promptInstalacaoAdiado = null;
  esconderBotaoInstalar();
}

// iOS não tem o prompt automático — mostra instrução simples
if (ehIOS() && !jaInstalado()) {
  window.addEventListener("load", () => {
    if (document.getElementById("botao-instalar-app")) return;
    const botao = document.createElement("div");
    botao.id = "botao-instalar-app";
    botao.className = "faixa-instalar";
    botao.innerHTML = `
      <span>📲 Toque em <strong>Compartilhar</strong> e depois em <strong>"Adicionar à Tela de Início"</strong></span>
      <button class="fechar-instalar" onclick="document.getElementById('botao-instalar-app').remove()">✕</button>
    `;
    document.body.insertBefore(botao, document.body.firstChild);
  });
}
