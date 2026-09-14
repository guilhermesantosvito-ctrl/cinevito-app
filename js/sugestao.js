let usuarioSugestao = null;

(async function iniciarSugestao() {
  usuarioSugestao = await exigirLogin();
})();

async function enviarSugestao() {
  const titulo = document.getElementById("s-titulo").value.trim();
  const erroEl = document.getElementById("s-erro");
  const sucessoEl = document.getElementById("s-sucesso");
  erroEl.style.display = "none";
  sucessoEl.style.display = "none";

  if (!titulo) {
    erroEl.textContent = "Digite ao menos o nome do filme.";
    erroEl.style.display = "block";
    return;
  }

  const { error } = await supabaseClient.from("sugestoes_filmes").insert({
    usuario_id: usuarioSugestao.id,
    titulo_sugerido: titulo,
    ano_lancamento: parseInt(document.getElementById("s-ano").value) || null,
    genero: document.getElementById("s-genero").value.trim() || null
  });

  if (error) {
    erroEl.textContent = "Erro ao enviar: " + error.message;
    erroEl.style.display = "block";
    return;
  }

  sucessoEl.style.display = "block";
  document.getElementById("s-titulo").value = "";
  document.getElementById("s-ano").value = "";
  document.getElementById("s-genero").value = "";
}
