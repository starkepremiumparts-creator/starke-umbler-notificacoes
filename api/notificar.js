function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function limparTexto(valor) {
  if (typeof valor !== "string") return null;

  const texto = valor.trim();

  if (!texto) return null;

  return texto;
}

function extrairTexto(msg) {
  const candidatos = [
    msg?.Content,
    msg?.content,
    msg?.Text,
    msg?.text,
    msg?.Body,
    msg?.body,
    msg?.Message,
    msg?.message,
    msg?.Caption,
    msg?.caption,
  ];

  for (const valor of candidatos) {
    if (typeof valor === "string") {
      const texto = limparTexto(valor);

      if (texto) return texto;
    }

    if (valor && typeof valor === "object") {
      const interno =
        limparTexto(valor.Text) ||
        limparTexto(valor.text) ||
        limparTexto(valor.Body) ||
        limparTexto(valor.body) ||
        limparTexto(valor.Content) ||
        limparTexto(valor.content);

      if (interno) return interno;
    }
  }

  return null;
}

function extrairOrigem(msg) {
  const candidatos = [
    msg?.Source,
    msg?.source,
    msg?.SenderType,
    msg?.senderType,
    msg?.Origin,
    msg?.origin,
    msg?.Sender?.Type,
    msg?.sender?.type,
  ];

  for (const valor of candidatos) {
    if (typeof valor === "string" && valor.trim()) {
      return valor.trim();
    }
  }

  return "";
}

function extrairData(msg) {
  const candidatos = [
    msg?.EventDate,
    msg?.eventDate,
    msg?.CreatedAtUTC,
    msg?.createdAtUTC,
    msg?.CreatedAt,
    msg?.createdAt,
    msg?.Date,
    msg?.date,
    msg?.Timestamp,
    msg?.timestamp,
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

function encontrarArrayMensagens(objeto) {
  let melhor = [];

  function procurar(valor, chave = "") {
    if (!valor || typeof valor !== "object") return;

    if (Array.isArray(valor)) {
      if (
        chave.toLowerCase().includes("message") &&
        valor.length > melhor.length
      ) {
        melhor = valor;
      }

      for (const item of valor) {
        procurar(item);
      }

      return;
    }

    for (const [novaChave, novoValor] of Object.entries(valor)) {
      procurar(novoValor, novaChave);
    }
  }

  procurar(objeto);

  return melhor;
}

function ultimasMensagensCliente(chat, quantidade = 3) {
  const mensagens = encontrarArrayMensagens(chat);

  const filtradas = mensagens
    .map((msg, indice) => ({
      texto: extrairTexto(msg),
      origem: extrairOrigem(msg),
      privada:
        msg?.IsPrivate === true ||
        msg?.isPrivate === true,
      data: extrairData(msg),
      indice,
    }))
    .filter((msg) => {
      if (!msg.texto || msg.privada) return false;

      const origem = msg.origem.toLowerCase();

      return (
        origem.includes("contact") ||
        origem.includes("contato")
      );
    })
    .sort((a, b) => {
      if (a.data && b.data) return a.data - b.data;

      return a.indice - b.indice;
    });

  const unicas = [];

  for (const mensagem of filtradas) {
    if (
      !unicas.some(
        (item) => item.texto === mensagem.texto
      )
    ) {
      unicas.push(mensagem);
    }
  }

  return unicas
    .slice(-quantidade)
    .map((item) => {
      if (item.texto.length <= 300) {
        return item.texto;
      }

      return item.texto.slice(0, 297) + "...";
    });
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return json(
        {
          success: false,
          error: "Método não permitido",
        },
        405
      );
    }

    try {
      const secret =
        request.headers.get("x-webhook-secret");

      if (
        !process.env.WEBHOOK_SECRET ||
        secret !== process.env.WEBHOOK_SECRET
      ) {
        return json(
          {
            success: false,
            error: "Não autorizado",
          },
          401
        );
      }

      const body = await request.json();

      const nome =
        body.nome?.trim() || "Cliente";

      const telefone =
        body.telefone?.trim() ||
        "Telefone não informado";

      const conversaId =
        body.conversaId?.trim();

      const regiao =
        body.regiao?.trim() ||
        "Central de Atendimento";

      if (!conversaId) {
        return json(
          {
            success: false,
            error: "conversaId não informado",
          },
          400
        );
      }

      const token =
        process.env.UMBLER_TOKEN;

      const organizationId =
        process.env.UMBLER_ORGANIZATION_ID;

      const fromPhone =
        process.env.CENTRAL_PHONE;

      let toPhone;

      if (
        regiao
          .toLowerCase()
          .includes("santos")
      ) {
        toPhone =
          process.env.CONSULTOR_SANTOS_PHONE;
      } else if (
        regiao
          .toLowerCase()
          .includes("campinas")
      ) {
        toPhone =
          process.env.CONSULTOR_CAMPINAS_PHONE;
      }

      if (
        !token ||
        !organizationId ||
        !fromPhone ||
        !toPhone
      ) {
        return json(
          {
            success: false,
            error:
              "Configuração incompleta na Vercel",
          },
          500
        );
      }

      // 1. BUSCAR A CONVERSA NO UMBLER
      const chatResponse = await fetch(
        `https://app-utalk.umbler.com/api/v1/chats/${encodeURIComponent(
          conversaId
        )}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!chatResponse.ok) {
        const erro = await chatResponse.text();

        console.error(
          "Erro ao consultar chat:",
          chatResponse.status,
          erro
        );

        return json(
          {
            success: false,
            error:
              "Não foi possível consultar a conversa no Umbler",
            statusUmbler:
              chatResponse.status,
          },
          502
        );
      }

      const chat =
        await chatResponse.json();

      // 2. PEGAR AS 3 ÚLTIMAS MENSAGENS DO CLIENTE
      const mensagens =
        ultimasMensagensCliente(chat, 3);

      let historico;

      if (mensagens.length) {
        historico = mensagens
          .map(
            (mensagem) =>
              `• ${mensagem}`
          )
          .join("\n");
      } else {
        historico =
          "• Não foi possível recuperar mensagens de texto do cliente.";
      }

      // 3. MONTAR A NOTIFICAÇÃO
      const mensagemAviso =
        `🔔 NOVO CONTATO NA CENTRAL — ${regiao.toUpperCase()}\n\n` +
        `👤 Cliente: ${nome}\n` +
        `📱 Telefone: ${telefone}\n\n` +
        `💬 Últimas mensagens do cliente:\n${historico}\n\n` +
        `O cliente selecionou ${regiao}.\n\n` +
        `Por favor, entre em contato para iniciar o atendimento.`;

      // 4. ENVIAR PARA O CONSULTOR
      const enviarResponse = await fetch(
        "https://app-utalk.umbler.com/api/v1/messages/simplified/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
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
        await enviarResponse
          .json()
          .catch(() => null);

      if (!enviarResponse.ok) {
        console.error(
          "Erro ao enviar mensagem:",
          resultadoEnvio
        );

        return json(
          {
            success: false,
            error:
              "Não foi possível enviar a notificação",
            statusUmbler:
              enviarResponse.status,
          },
          502
        );
      }

      return json({
        success: true,
        regiao,
        cliente: nome,
        mensagensEncontradas:
          mensagens.length,
        envio: resultadoEnvio,
      });
    } catch (error) {
      console.error(error);

      return json(
        {
          success: false,
          error: "Erro interno",
        },
        500
      );
    }
  },
};
