// Termos de uso, Privacidade e Licença (SPECS, seção 26.2), em linguagem simples. Os mesmos textos ficam em arquivos .md na pasta
// legal/ (e na cópia publicada). Se mudar um, mude o outro.
// ISSUES_URL: endereço da página de problemas (Issues) do repositório. É preenchido na hora de publicar (ver README da publicação).
(() => {
  const App = (window.App = window.App || {});
  const {esc} = App.format;

  const ISSUES_URL = 'https://github.com/julioinformaticagvt/gestao-financeira/issues';
  const HOLDER = 'Jul1o Informática';   // trocar pelo nome de quem detém os direitos (também em legal/LICENSE e na cópia publicada)

  const TERMS = `Termos de uso

1. O que é: um sistema gratuito de gestão financeira para pequenos negócios (clientes, vendas, contas a receber e a pagar, orçamentos, ordens de serviço e relatórios), que funciona no seu navegador.
2. Gratuito e "como está": o sistema é oferecido sem garantia de qualquer tipo, sem promessa de funcionamento contínuo ou livre de erros.
3. Não substitui seu contador: o sistema não emite nota fiscal, não calcula nem declara impostos. Valores de imposto, multa, juros e limites (como o do MEI) são informativos: confira sempre com o seu contador.
4. Sua responsabilidade: você é responsável por conferir os valores, as datas e os documentos que gerar, e por usar o sistema de acordo com a lei.
5. Seus dados e backup: os dados ficam no seu navegador. Se o navegador for limpo, o aparelho estragar ou for perdido, os dados podem ser perdidos. Faça backup com frequência (Configurações > Backup).
6. Limite de responsabilidade: o autor não responde por perdas de dados, lucros cessantes ou prejuízos decorrentes do uso do sistema.
7. Mudanças: estes termos e o sistema podem mudar. A versão em uso aparece em Configurações > Sobre.`;

  const PRIVACY = `Privacidade

1. Onde ficam os dados: tudo que você digita (clientes, vendas, contas, logo, configurações) fica guardado no próprio navegador, neste aparelho. O sistema não tem servidor próprio.
2. O que o autor recebe: nada. O autor não recebe, não vê e não guarda nenhum dos seus dados. O sistema não usa análise de uso, rastreadores nem publicidade.
3. Dados dos seus clientes (LGPD): você é o responsável pelos dados pessoais dos seus clientes que cadastrar. Guarde só o necessário, proteja o aparelho com senha e cuide dos backups e dos arquivos exportados (CSV e PDF contêm dados pessoais).
4. Limpar os dados do navegador apaga tudo, se não houver backup. O computador e o celular têm dados separados, a não ser que você ligue a sincronização opcional com o Google Drive.
5. Backups e exportações: os arquivos que você baixa ficam com você; guarde-os em lugar seguro.
6. Sincronização com o Google Drive (opcional, vem desligada): se você ligar, uma cópia dos seus dados fica no SEU Google Drive, numa pasta privada do aplicativo (o sistema não enxerga os seus outros arquivos). O autor do sistema não recebe nem vê esses dados. O Google trata os dados conforme as regras dele. Desconectar não apaga o arquivo do Drive; para apagá-lo, use "Apagar os dados do Drive" em Configurações. O e-mail da conta Google usada fica guardado só neste aparelho, para o Google não perguntar a conta de novo ao reconectar (Desconectar apaga). O login do Google só é carregado quando você liga a sincronização.`;

  const LICENSE = `Licença MIT

Copyright (c) 2026 ${HOLDER}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

A fonte IBM Plex Sans acompanha o sistema sob a licença SIL Open Font License 1.1 (arquivo fonts/OFL-LICENSE.txt).`;

  const TEXTS = {terms: TERMS, privacy: PRIVACY, license: LICENSE};
  function show(kind) {
    const text = TEXTS[kind];
    if (!text) return;
    const [title, ...rest] = text.split('\n');
    App.ui.openModal(`<h2>${esc(title)}</h2><div class="legal-text">${esc(rest.join('\n').trim()).replace(/\n/g, '<br>')}</div><div class="actions"><button type="button" class="primary" data-action="close-modal">Fechar</button></div>`);
  }

  App.ui.registerAction('legal-terms', () => show('terms'));
  App.ui.registerAction('legal-privacy', () => show('privacy'));
  App.ui.registerAction('legal-license', () => show('license'));

  App.legal = {ISSUES_URL, HOLDER, TEXTS, show,
    issuesHtml: () => ISSUES_URL ? `<a href="${esc(ISSUES_URL)}" target="_blank" rel="noopener">Avisar de um erro (página de problemas)</a>` : '<span class="muted">Para avisar de um erro, use a página de problemas (Issues) do repositório de onde você abriu o sistema.</span>'};
})();
