// ==========================================
// STÄRKE PARTS - NOTIFICAÇÕES UMBLER TALK
// ==========================================

function textoValido(valor) {
  if (typeof valor !== "string") return null;

  const texto = valor.trim();

  return texto.length ? texto : null;
}
// ==========================================
// LEITURA DAS MENSAGENS DA UMBLER
// ==========================================

function extrairTexto(mensagem) {
  // Se a mensagem foi editada, usamos o texto mais recente.
  const textoEditado =
    textoValido(mensagem?.latestEdit?.content) ||
    textoValido(mensagem?.LatestEdit?.Content);

  if (textoEditado) {
    return textoEditado;
  }

  const candidatos = [
    mensagem?.content,
    mensagem?.Content,
    mensagem?.text,
    mensagem?.Text,
    mensagem?.body,
    mensagem?.Body,
    mensagem?.message,
    mensagem?.Message,

    // Caso seja mídia com legenda
    mensagem?.file?.caption,
    mensagem?.File?.Caption,
    mensagem?.thumbnail?.caption,
    mensagem?.Thumbnail?.Caption,
  ];

  for (const valor of candidatos) {
    if (typeof valor === "string") {
      const texto = textoValido(valor);

      if (texto) {
        return texto;
      }
    }
  }

  // Algumas interações podem vir como botão selecionado.
  const botoes =
    mensagem?.buttons ||
    mensagem?.Buttons;

  if (Array.isArray(botoes)) {
    const selecionado = botoes.find(
      (botao) =>
        botao?.selected === true ||
        botao?.Selected === true
    );

    const textoBotao =
      textoValido(selecionado?.text) ||
      textoValido(selecionado?.Text);

    if (textoBotao) {
      return textoBotao;
    }
  }

  return null;
}


// Identifica de quem veio a mensagem.
function extrairOrigem(mensagem) {
  const source =
    mensagem?.source ??
    mensagem?.Source;

  if (
    typeof source === "string" &&
    source.trim()
  ) {
    return source
      .trim()
      .toLowerCase();
  }

  // Fallback importante:
  // mensagens recebidas do cliente podem possuir fromContact.
  if (
    mensagem?.fromContact?.id ||
    mensagem?.FromContact?.Id ||
    mensagem?.FromContact?.id
  ) {
    return "contact";
  }

  if (
    mensagem?.sentByOrganizationMember?.id ||
    mensagem?.SentByOrganizationMember?.Id
  ) {
    return "member";
  }

  if (
    mensagem?.botInstance?.id ||
    mensagem?.BotInstance?.Id
  ) {
    return "bot";
  }

  return "";
}


// Data real do evento da mensagem.
function extrairData(mensagem) {
  const candidatos = [
    mensagem?.eventAtUTC,
    mensagem?.EventAtUTC,

    mensagem?.createdAtUTC,
    mensagem?.CreatedAtUTC,

    mensagem?.eventDate,
    mensagem?.EventDate,

    mensagem?.createdAt,
    mensagem?.CreatedAt,

    mensagem?.timestamp,
    mensagem?.Timestamp,

    mensagem?.date,
    mensagem?.Date,
  ];

  for (const valor of candidatos) {
    if (!valor) continue;

    const data = new Date(valor);

    if (!Number.isNaN(data.getTime())) {
      return data.getTime();
    }
  }

  return 0;
}


// Localiza o histórico retornado pela Umbler.
function encontrarMensagens(chat) {
  if (!chat || typeof chat !== "object") {
    return [];
  }

  // PRIMEIRO: estrutura utilizada pelo GET do chat.
  const diretos = [
    chat.latestMessages,
    chat.LatestMessages,

    // Mantemos fallbacks por compatibilidade.
    chat.messages,
    chat.Messages,
    chat.lastMessages,
    chat.LastMessages,
  ];

  for (const candidato of diretos) {
    if (Array.isArray(candidato)) {
      return candidato;
    }
  }

  // Último fallback: procurar arrays relacionados
  // a mensagens em qualquer nível do JSON.
  let melhorArray = [];

  function procurar(valor, nomeCampo = "") {
    if (!valor || typeof valor !== "object") {
      return;
    }

    if (Array.isArray(valor)) {
      const nome =
        nomeCampo.toLowerCase();

      if (
        nome.includes("message") &&
        valor.length > melhorArray.length
      ) {
        melhorArray = valor;
      }

      for (const item of valor) {
        procurar(item);
      }

      return;
    }

    for (const [chave, conteudo] of Object.entries(valor)) {
      procurar(conteudo, chave);
    }
  }

  procurar(chat);

  return melhorArray;
}


// Retorna somente as últimas mensagens enviadas PELO CLIENTE.
function pegarUltimasMensagensCliente(
  chat,
  quantidade = 3
) {
  const mensagens =
    encontrarMensagens(chat);

  const tratadas = mensagens
    .map((mensagem, indice) => {
      const origem =
        extrairOrigem(mensagem);

      const veioDoContato =
        origem.includes("contact") ||
        origem.includes("contato") ||
        Boolean(
          mensagem?.fromContact?.id ||
          mensagem?.FromContact?.Id ||
          mensagem?.FromContact?.id
        );

      return {
        texto:
          extrairTexto(mensagem),

        origem,

        veioDoContato,

        data:
          extrairData(mensagem),

        indice,

        privada:
          mensagem?.isPrivate === true ||
          mensagem?.IsPrivate === true,
      };
    })

    .filter((mensagem) => {
      // Precisa ter conteúdo textual.
      if (!mensagem.texto) {
        return false;
      }

      // Ignora notas internas.
      if (mensagem.privada) {
        return false;
      }

      // SOMENTE mensagens do cliente.
      if (!mensagem.veioDoContato) {
        return false;
      }

      return true;
    })

    .sort((a, b) => {
      if (a.data && b.data) {
        return a.data - b.data;
      }

      return a.indice - b.indice;
    });


  // Evita mensagens duplicadas.
  const semDuplicados = [];

  for (const mensagem of tratadas) {
    const jaExiste =
      semDuplicados.some(
        (item) =>
          item.texto === mensagem.texto
      );

    if (!jaExiste) {
      semDuplicados.push(mensagem);
    }
  }


  // Somente as últimas N mensagens.
  return semDuplicados
    .slice(-quantidade)
    .map((mensagem) => {
      // Limita mensagens enormes.
      if (mensagem.texto.length > 300) {
        return (
          mensagem.texto.slice(0, 297) +
          "..."
        );
      }

      return mensagem.texto;
    });
}

export default async function handler(req, res) {
  // Aceitamos somente POST.
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
    });
  }

  try {
    // ==========================================
    // 1. SEGURANÇA DO WEBHOOK
    // ==========================================

    const secretRecebido =
      req.headers["x-webhook-secret"];

    if (
      !process.env.WEBHOOK_SECRET ||
      secretRecebido !== process.env.WEBHOOK_SECRET
    ) {
      return res.status(401).json({
        success: false,
        error: "Não autorizado",
      });
    }

    // ==========================================
    // 2. DADOS RECEBIDOS DO CHATBOT
    // ==========================================

    let body = req.body;

    // Proteção caso o body chegue como texto.
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    body = body || {};

    const nome =
      textoValido(body.nome) || "Cliente";

    const telefone =
      textoValido(body.telefone) ||
      "Telefone não informado";

    const conversaId =
      textoValido(body.conversaId);

    const regiao =
      textoValido(body.regiao) ||
      "Central";

    if (!conversaId) {
      return res.status(400).json({
        success: false,
        error: "conversaId não informado",
      });
    }

    // ==========================================
    // 3. CONFIGURAÇÕES DA VERCEL
    // ==========================================

    const token =
      process.env.UMBLER_TOKEN;

    const organizationId =
      process.env.UMBLER_ORGANIZATION_ID;

    const fromPhone =
      process.env.CENTRAL_PHONE;

    if (
      !token ||
      !organizationId ||
      !fromPhone
    ) {
      return res.status(500).json({
        success: false,
        error:
          "Configuração da Umbler incompleta na Vercel",
      });
    }

    // ==========================================
    // 4. ESCOLHER CONSULTOR PELA REGIÃO
    // ==========================================

    const regiaoNormalizada =
      regiao.toLowerCase();

    let toPhone;

    if (regiaoNormalizada.includes("santos")) {
      toPhone =
        process.env.CONSULTOR_SANTOS_PHONE;

    } else if (regiaoNormalizada.includes("campinas")) {
      toPhone =
        process.env.CONSULTOR_CAMPINAS_PHONE;

    } else if (regiaoNormalizada.includes("sorocaba")) {
      toPhone =
        process.env.CONSULTOR_SOROCABA_PHONE;
    }

    if (!toPhone) {
      return res.status(400).json({
        success: false,
        error:
          `Nenhum consultor configurado para ${regiao}`,
      });
    }

    // ==========================================
    // 5. BUSCAR A CONVERSA NA UMBLER
    // ==========================================

const urlChat =
  `https://app-utalk.umbler.com/api/v1/chats/${encodeURIComponent(
    conversaId
  )}/?organizationId=${encodeURIComponent(
    organizationId
  )}`;

    const respostaChat = await fetch(
      urlChat,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

    if (!respostaChat.ok) {
      const detalhe =
        await respostaChat.text();

      console.error(
        "Erro ao buscar chat:",
        respostaChat.status,
        detalhe
      );

      return res.status(502).json({
        success: false,
        error:
          "Não foi possível consultar a conversa no Umbler",
        statusUmbler:
          respostaChat.status,
      });
    }

    const chat =
      await respostaChat.json();

    // A rota GET /v1/chats/{id}/ pode retornar
    // até 100 mensagens recentes da conversa.
    const ultimasMensagens =
      pegarUltimasMensagensCliente(chat, 3);

    // ==========================================
    // 6. FORMATAR HISTÓRICO
    // ==========================================

    let historico;

    if (ultimasMensagens.length) {
      historico = ultimasMensagens
        .map(
          (mensagem) =>
            `• ${mensagem}`
        )
        .join("\n");
    } else {
      historico =
        "• Nenhuma mensagem de texto do cliente foi encontrada.";
    }

    // ==========================================
    // 7. MONTAR NOTIFICAÇÃO
    // ==========================================

    const mensagemAviso =
      `🔔 NOVO CONTATO NA CENTRAL — ${regiao.toUpperCase()}\n\n` +
      `👤 Cliente: ${nome}\n` +
      `📱 Telefone: ${telefone}\n\n` +
      `💬 Últimas mensagens do cliente:\n` +
      `${historico}\n\n` +
      `📍 Região selecionada: ${regiao}\n\n` +
      `Por favor, entre em contato com o cliente para iniciar o atendimento.`;

    // ==========================================
    // 8. ENVIAR PARA O CONSULTOR
    // ==========================================

    const respostaEnvio = await fetch(
      "https://app-utalk.umbler.com/api/v1/messages/simplified/",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          toPhone,
          fromPhone,
          organizationId,
          message: mensagemAviso,
          file: null,
          skipReassign: false,
          contactName:
            `Consultor ${regiao}`,
        }),
      }
    );

    const resultadoEnvio =
      await respostaEnvio
        .json()
        .catch(() => null);

    if (!respostaEnvio.ok) {
      console.error(
        "Erro no envio:",
        respostaEnvio.status,
        resultadoEnvio
      );

      return res.status(502).json({
        success: false,
        error:
          "Não foi possível enviar a notificação",
        statusUmbler:
          respostaEnvio.status,
      });
    }

    // ==========================================
    // 9. SUCESSO
    // ==========================================

    return res.status(200).json({
      success: true,
      cliente: nome,
      regiao,
      mensagensEncontradas:
        ultimasMensagens.length,
    });
  } catch (error) {
    console.error(
      "Erro interno:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Erro interno",
    });
  }
}
