// ==========================================
// STÄRKE PARTS - NOTIFICAÇÕES UMBLER TALK
// Campinas • Santos • Sorocaba
// ==========================================

function textoValido(valor) {
  if (typeof valor !== "string") return null;

  const texto = valor.trim();

  return texto ? texto : null;
}

function limitarTexto(texto, limite = 300) {
  if (!texto) return null;

  return texto.length > limite
    ? `${texto.slice(0, limite - 3)}...`
    : texto;
}

function extrairTexto(mensagem) {
  const candidatosDiretos = [
    mensagem?.latestEdit?.content,
    mensagem?.LatestEdit?.Content,
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
    mensagem?.file?.caption,
    mensagem?.File?.Caption,
    mensagem?.thumbnail?.caption,
    mensagem?.Thumbnail?.Caption,
  ];

  for (const valor of candidatosDiretos) {
    const texto = textoValido(valor);

    if (texto) {
      return texto;
    }
  }

  const candidatosObjetos = [
    mensagem?.content,
    mensagem?.Content,
    mensagem?.message,
    mensagem?.Message,
  ];

  for (const objeto of candidatosObjetos) {
    if (
      !objeto ||
      typeof objeto !== "object" ||
      Array.isArray(objeto)
    ) {
      continue;
    }

    const texto =
      textoValido(objeto.text) ||
      textoValido(objeto.Text) ||
      textoValido(objeto.content) ||
      textoValido(objeto.Content) ||
      textoValido(objeto.body) ||
      textoValido(objeto.Body) ||
      textoValido(objeto.caption) ||
      textoValido(objeto.Caption);

    if (texto) {
      return texto;
    }
  }

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
      textoValido(selecionado?.Text) ||
      textoValido(selecionado?.title) ||
      textoValido(selecionado?.Title);

    if (textoBotao) {
      return textoBotao;
    }
  }

  return null;
}

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
    if (
      typeof valor === "string" &&
      valor.trim()
    ) {
      return valor
        .trim()
        .toLowerCase();
    }
  }

  return "";
}

function veioDoCliente(mensagem) {
  const origem =
    extrairOrigem(mensagem);

  if (
    origem.includes("contact") ||
    origem.includes("contato") ||
    origem.includes("customer") ||
    origem.includes("cliente")
  ) {
    return true;
  }

  if (
    mensagem?.fromContact ||
    mensagem?.FromContact ||
    mensagem?.contactSender ||
    mensagem?.ContactSender
  ) {
    return true;
  }

  return false;
}

function ehPrivada(mensagem) {
  return (
    mensagem?.isPrivate === true ||
    mensagem?.IsPrivate === true ||
    mensagem?.private === true ||
    mensagem?.Private === true
  );
}

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
    if (!valor) {
      continue;
    }

    const data =
      new Date(valor);

    if (
      !Number.isNaN(
        data.getTime()
      )
    ) {
      return data.getTime();
    }
  }

  return 0;
}

function pareceObjetoMensagem(objeto) {
  if (
    !objeto ||
    typeof objeto !== "object" ||
    Array.isArray(objeto)
  ) {
    return false;
  }

  let pontos = 0;

  if (
    "content" in objeto ||
    "Content" in objeto
  ) {
    pontos += 2;
  }

  if (
    "source" in objeto ||
    "Source" in objeto
  ) {
    pontos += 2;
  }

  if (
    "messageType" in objeto ||
    "MessageType" in objeto
  ) {
    pontos += 1;
  }

  if (
    "fromContact" in objeto ||
    "FromContact" in objeto
  ) {
    pontos += 2;
  }

  if (
    "eventAtUTC" in objeto ||
    "EventAtUTC" in objeto
  ) {
    pontos += 1;
  }

  if (
    "createdAtUTC" in objeto ||
    "CreatedAtUTC" in objeto
  ) {
    pontos += 1;
  }

  if (
    "id" in objeto ||
    "Id" in objeto
  ) {
    pontos += 1;
  }

  return pontos >= 3;
}

function coletarObjetosMensagem(raiz) {
  const encontrados = [];

  const visitados =
    new WeakSet();

  function percorrer(
    valor,
    caminho = "chat"
  ) {
    if (
      !valor ||
      typeof valor !== "object"
    ) {
      return;
    }

    if (!Array.isArray(valor)) {
      if (
        visitados.has(valor)
      ) {
        return;
      }

      visitados.add(valor);

      if (
        pareceObjetoMensagem(valor)
      ) {
        encontrados.push({
          mensagem: valor,
          caminho,
        });
      }

      for (
        const [chave, conteudo]
        of Object.entries(valor)
      ) {
        percorrer(
          conteudo,
          `${caminho}.${chave}`
        );
      }

      return;
    }

    for (
      let i = 0;
      i < valor.length;
      i++
    ) {
      percorrer(
        valor[i],
        `${caminho}[${i}]`
      );
    }
  }

  percorrer(raiz);

  return encontrados;
}

function pegarUltimasMensagensCliente(
  chat,
  quantidade = 3
) {
  const encontrados =
    coletarObjetosMensagem(chat);

  console.error(
    "Diagnóstico do chat:",
    {
      camposPrincipais:
        chat &&
        typeof chat === "object" &&
        !Array.isArray(chat)
          ? Object.keys(chat).slice(
              0,
              30
            )
          : [],

      objetosParecidosComMensagem:
        encontrados.length,

      caminhosAmostra:
        encontrados
          .slice(0, 10)
          .map(
            (item) =>
              item.caminho
          ),
    }
  );

  const tratadas =
    encontrados
      .map(
        (
          {
            mensagem,
            caminho,
          },
          indice
        ) => ({
          id:
            mensagem?.id ||
            mensagem?.Id ||
            mensagem?._id ||
            null,

          texto:
            extrairTexto(
              mensagem
            ),

          veioDoCliente:
            veioDoCliente(
              mensagem
            ),

          privada:
            ehPrivada(
              mensagem
            ),

          data:
            extrairData(
              mensagem
            ),

          indice,

          caminho,
        })
      )

      .filter(
        (item) =>
          item.texto &&
          item.veioDoCliente &&
          !item.privada
      )

      .sort((a, b) => {
        if (
          a.data &&
          b.data &&
          a.data !== b.data
        ) {
          return (
            a.data -
            b.data
          );
        }

        return (
          a.indice -
          b.indice
        );
      });

  const unicas = [];

  const chaves =
    new Set();

  for (
    const item
    of tratadas
  ) {
    const chave =
      item.id ||
      `${item.data}|${item.texto}`;

    if (
      chaves.has(chave)
    ) {
      continue;
    }

    chaves.add(chave);

    unicas.push(item);
  }

  console.error(
    "Mensagens do cliente encontradas:",
    {
      quantidade:
        unicas.length,

      caminhos:
        unicas
          .slice(-5)
          .map(
            (item) =>
              item.caminho
          ),
    }
  );

  return unicas
    .slice(-quantidade)
    .map(
      (item) =>
        limitarTexto(
          item.texto,
          300
        )
    );
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        success: false,
        error:
          "Método não permitido",
      });
  }

  try {
    // ==========================================
    // 1. SEGURANÇA
    // ==========================================

    const secretRecebido =
      req.headers[
        "x-webhook-secret"
      ];

    if (
      !process.env
        .WEBHOOK_SECRET ||
      secretRecebido !==
        process.env
          .WEBHOOK_SECRET
    ) {
      return res
        .status(401)
        .json({
          success: false,
          error:
            "Não autorizado",
        });
    }

    // ==========================================
    // 2. DADOS DO CHATBOT
    // ==========================================

    let body = req.body;

    if (
      typeof body ===
      "string"
    ) {
      body =
        JSON.parse(body);
    }

    body =
      body || {};

    const nome =
      textoValido(
        body.nome
      ) ||
      "Cliente";

    const telefone =
      textoValido(
        body.telefone
      ) ||
      "Telefone não informado";

    const conversaId =
      textoValido(
        body.conversaId
      );

    const regiao =
      textoValido(
        body.regiao
      ) ||
      "Central";

    if (!conversaId) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "conversaId não informado",
        });
    }

    // ==========================================
    // 3. VARIÁVEIS DA VERCEL
    // ==========================================

    const token =
      process.env
        .UMBLER_TOKEN;

    const organizationId =
      process.env
        .UMBLER_ORGANIZATION_ID;

    const fromPhone =
      process.env
        .CENTRAL_PHONE;

    if (
      !token ||
      !organizationId ||
      !fromPhone
    ) {
      return res
        .status(500)
        .json({
          success: false,
          error:
            "Configuração da Umbler incompleta na Vercel",
        });
    }

    // ==========================================
    // 4. CONSULTOR POR REGIÃO
    // ==========================================

    const regiaoNormalizada =
      regiao.toLowerCase();

    let toPhone;

    if (
      regiaoNormalizada.includes(
        "santos"
      )
    ) {
      toPhone =
        process.env
          .CONSULTOR_SANTOS_PHONE;

    } else if (
      regiaoNormalizada.includes(
        "campinas"
      )
    ) {
      toPhone =
        process.env
          .CONSULTOR_CAMPINAS_PHONE;

    } else if (
      regiaoNormalizada.includes(
        "sorocaba"
      )
    ) {
      toPhone =
        process.env
          .CONSULTOR_SOROCABA_PHONE;
    }

    if (!toPhone) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            `Nenhum consultor configurado para ${regiao}`,
        });
    }

    // ==========================================
    // 5. BUSCAR CONVERSA / HISTÓRICO
    // ==========================================

    let ultimasMensagens = [];

    let historicoRecuperado =
      false;

    try {
      const urlChat =
        `https://app-utalk.umbler.com/api/v1/chats/${encodeURIComponent(
          conversaId
        )}/?organizationId=${encodeURIComponent(
          organizationId
        )}`;

      const respostaChat =
        await fetch(
          urlChat,
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (
        respostaChat.ok
      ) {
        const chat =
          await respostaChat.json();

        ultimasMensagens =
          pegarUltimasMensagensCliente(
            chat,
            3
          );

        historicoRecuperado =
          true;

      } else {
        const detalhe =
          await respostaChat.text();

        console.error(
          "Não foi possível buscar o histórico:",
          respostaChat.status,
          detalhe
        );
      }

    } catch (
      erroHistorico
    ) {
      console.error(
        "Erro ao consultar histórico da conversa:",
        erroHistorico
      );
    }

    // ==========================================
    // 6. FORMATAR HISTÓRICO
    // ==========================================

    let historico;

    if (
      ultimasMensagens.length >
      0
    ) {
      historico =
        ultimasMensagens
          .map(
            (mensagem) =>
              `• ${mensagem}`
          )
          .join("\n");

    } else if (
      historicoRecuperado
    ) {
      historico =
        "• Nenhuma mensagem de texto do cliente foi localizada no histórico.";

    } else {
      historico =
        "• Histórico não recuperado automaticamente.";
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
    // 8. ENVIAR AO CONSULTOR
    // ==========================================

    const respostaEnvio =
      await fetch(
        "https://app-utalk.umbler.com/api/v1/messages/simplified/",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              toPhone,

              fromPhone,

              organizationId,

              message:
                mensagemAviso,

              file: null,

              skipReassign:
                false,

              contactName:
                `Consultor ${regiao}`,
            }),
        }
      );

    const respostaTexto =
      await respostaEnvio.text();

    let resultadoEnvio =
      null;

    if (respostaTexto) {
      try {
        resultadoEnvio =
          JSON.parse(
            respostaTexto
          );

      } catch {
        resultadoEnvio =
          respostaTexto;
      }
    }

    if (
      !respostaEnvio.ok
    ) {
      console.error(
        "Erro no envio:",
        respostaEnvio.status,
        resultadoEnvio
      );

      return res
        .status(502)
        .json({
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

    return res
      .status(200)
      .json({
        success: true,

        cliente: nome,

        regiao,

        mensagensEncontradas:
          ultimasMensagens.length,

        historicoConsultado:
          historicoRecuperado,
      });

  } catch (error) {
    console.error(
      "Erro interno:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,
        error:
          "Erro interno",
      });
  }
}
