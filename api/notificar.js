// ==========================================
// STÄRKE PARTS - NOTIFICAÇÕES UMBLER TALK
// ==========================================

function textoValido(valor) {
  if (typeof valor !== "string") return null;

  const texto = valor.trim();

  return texto.length ? texto : null;
}

// Procura o texto dentro de uma mensagem,
// mesmo que a estrutura da Umbler mude um pouco.
function extrairTexto(mensagem) {
  const candidatos = [
    mensagem?.content,
    mensagem?.Content,
    mensagem?.text,
    mensagem?.Text,
    mensagem?.body,
    mensagem?.Body,
    mensagem?.message,
    mensagem?.Message,
    mensagem?.caption,
    mensagem?.Caption,
  ];

  for (const valor of candidatos) {
    if (typeof valor === "string") {
      const texto = textoValido(valor);

      if (texto) return texto;
    }

    if (valor && typeof valor === "object") {
      const texto =
        textoValido(valor.text) ||
        textoValido(valor.Text) ||
        textoValido(valor.content) ||
        textoValido(valor.Content) ||
        textoValido(valor.body) ||
        textoValido(valor.Body);

      if (texto) return texto;
    }
  }

  return null;
}

// Identifica quem enviou a mensagem.
function extrairOrigem(mensagem) {
  const candidatos = [
    mensagem?.source,
    mensagem?.Source,
    mensagem?.senderType,
    mensagem?.SenderType,
    mensagem?.origin,
    mensagem?.Origin,
    mensagem?.sender?.type,
    mensagem?.Sender?.Type,
  ];

  for (const valor of candidatos) {
    if (typeof valor === "string" && valor.trim()) {
      return valor.trim().toLowerCase();
    }
  }

  return "";
}

// Data da mensagem para colocarmos na ordem correta.
function extrairData(mensagem) {
  const candidatos = [
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

// Procura automaticamente o array de mensagens
// retornado pela API da Umbler.
function encontrarMensagens(objeto) {
  if (!objeto || typeof objeto !== "object") {
    return [];
  }

  // Tentamos primeiro os campos mais prováveis.
  const diretos = [
    objeto.messages,
    objeto.Messages,
    objeto.lastMessages,
    objeto.LastMessages,
  ];

  for (const candidato of diretos) {
    if (Array.isArray(candidato)) {
      return candidato;
    }
  }

  // Se não encontrar, procura dentro do objeto.
  let melhorArray = [];

  function procurar(valor, nomeCampo = "") {
    if (!valor || typeof valor !== "object") {
      return;
    }

    if (Array.isArray(valor)) {
      if (
        nomeCampo.toLowerCase().includes("message") &&
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

  procurar(objeto);

  return melhorArray;
}

// Retorna somente as últimas mensagens do CLIENTE.
function pegarUltimasMensagensCliente(chat, quantidade = 3) {
  const mensagens = encontrarMensagens(chat);

  const tratadas = mensagens
    .map((mensagem, indice) => {
      return {
        texto: extrairTexto(mensagem),
        origem: extrairOrigem(mensagem),
        data: extrairData(mensagem),
        indice,
        privada:
          mensagem?.isPrivate === true ||
          mensagem?.IsPrivate === true,
      };
    })
    .filter((mensagem) => {
      if (!mensagem.texto) return false;
      if (mensagem.privada) return false;

      // A Umbler normalmente identifica mensagens
      // do cliente como Contact.
      return (
        mensagem.origem.includes("contact") ||
        mensagem.origem.includes("contato")
      );
    })
    .sort((a, b) => {
      if (a.data && b.data) {
        return a.data - b.data;
      }

      return a.indice - b.indice;
    });

  // Evita repetir mensagens idênticas.
  const semDuplicados = [];

  for (const mensagem of tratadas) {
    const jaExiste = semDuplicados.some(
      (item) => item.texto === mensagem.texto
    );

    if (!jaExiste) {
      semDuplicados.push(mensagem);
    }
  }

  return semDuplicados
    .slice(-quantidade)
    .map((mensagem) => {
      // Evita uma notificação gigantesca.
      if (mensagem.texto.length > 300) {
        return mensagem.texto.slice(0, 297) + "...";
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

    if (
      regiaoNormalizada.includes("santos")
    ) {
      toPhone =
        process.env.CONSULTOR_SANTOS_PHONE;
    }

    if (
      regiaoNormalizada.includes("campinas")
    ) {
      toPhone =
        process.env.CONSULTOR_CAMPINAS_PHONE;
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
      )}/`;

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
