// Configuração da sincronização com o Google Drive (SPECS, seção 27.3).
// GOOGLE_CLIENT_ID: o "ID do cliente" do Google (Google Cloud > APIs e serviços > Credenciais > ID do cliente OAuth, tipo "Aplicativo da Web").
// Esse ID NÃO é senha: pode ficar no código publicado. Enquanto o valor for o texto de exemplo, o sistema mostra
// "Sincronização ainda não configurada" e nem carrega o script do Google.
(() => {
  const App = (window.App = window.App || {});
  App.syncConfig = {GOOGLE_CLIENT_ID: '132769679260-vbn2l3attcht636sk6k2vaj8cq7pg01j.apps.googleusercontent.com', PLACEHOLDER: 'COLE_AQUI_O_ID_DO_CLIENTE'};
})();
