// ==========================================
// STÄRKE PARTS
// PONTE CENTRAL ↔ CONSULTORES
// TEXTO + MÍDIA COM RETRY AUTOMÁTICO
// ==========================================
//
// RETORNO_CONSULTORES:
//
// Nome|WhatsApp|Etiqueta|ChatId
//
// ==========================================


// ==========================================
// ANTI-DUPLICAÇÃO LOCAL
// ==========================================

const midiasProcessadas =
  globalThis.__STK_MIDIAS_PROCESSADAS ||
  new Set();

globalThis.__STK_MIDIAS_PROCESSADAS =
  midiasProcessadas;


// ==========================================
// UTILITÁRIOS
// ==========================================

function textoValido(valor) {
  if (typeof valor !== "string") {
    return null;
  }

  const texto = valor.trim();

  return texto.length > 0
    ? texto
    : null;
}


function esperar(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function normalizarTelefone(valor) {
  if (!valor) {
    return null;
  }

  let numero =
    String(valor)
      .replace(/\D/g, "");

  if (
    numero.length === 10 ||
    numero.length === 11
  ) {
    numero =
      "55" + numero;
  }

  if (
    numero.length < 12 ||
    numero.length > 15
  ) {
    return null;
  }

  return "+" + numero;
}


function normalizarTextoComparacao(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}


// ==========================================
// CONSULTOR
// ==========================================

function cadastrarConsultor(
  consultores,
  nome,
  telefone,
  etiqueta = null,
  chatId = null
) {
  const telefoneNormalizado =
    normalizarTelefone(
      telefone
    );

  if (!telefoneNormalizado) {
    return;
  }

  if (
    consultores.has(
      telefoneNormalizado
    )
  ) {
    return;
  }

  consultores.set(
    telefoneNormalizado,
    {
      nome:
        textoValido(nome) ||
        "Consultor Stärke Parts",

      telefone:
        telefoneNormalizado,

      etiqueta:
        textoValido(etiqueta),

      chatId:
        textoValido(chatId),
    }
  );
}


// ==========================================
// CARREGAR CONSULTORES
// ==========================================

function obterConsultoresAutorizados() {
  const consultores =
    new Map();

  const lista =
    process.env
      .RETORNO_CONSULTORES ||
    "";

  const linhas =
    lista
      .split(/\r?\n|;/)
      .map(
        (linha) =>
          linha.trim()
      )
      .filter(Boolean);

  for (const linha of linhas) {
    const partes =
      linha
        .split("|")
        .map(
          (parte) =>
            parte.trim()
        );

    if (partes.length >= 2) {
      cadastrarConsultor(
        consultores,
        partes[0],
        partes[1],
        partes[2] || null,
        partes[3] || null
      );

      continue;
    }

    cadastrarConsultor(
      consultores,
      "Consultor Stärke Parts",
      partes[0]
    );
  }


  // Compatibilidade com variáveis antigas.

  cadastrarConsultor(
    consultores,
    "Consultor Santos",
    process.env
      .CONSULTOR_SANTOS_PHONE
  );

  cadastrarConsultor(
    consultores,
    "Consultor Campinas",
    process.env
      .CONSULTOR_CAMPINAS_PHONE
  );

  cadastrarConsultor(
    consultores,
    "Consultor Sorocaba",
    process.env
      .CONSULTOR_SOROCABA_PHONE
  );


  return consultores;
}


// ==========================================
// CONSULTOR PELA ETIQUETA
// ==========================================

function localizarConsultorPorEtiqueta(
  consultores,
  tags
) {
  if (!Array.isArray(tags)) {
    return null;
  }

  const etiquetasContato =
    tags
      .map(
        (tag) =>
          normalizarTextoComparacao(
            tag?.Name ||
            tag?.name
          )
      )
      .filter(Boolean);

  if (!etiquetasContato.length) {
    return null;
  }


  for (
    const consultor
    of consultores.values()
  ) {
    if (!consultor.etiqueta) {
      continue;
    }

    const etiquetaConsultor =
      normalizarTextoComparacao(
        consultor.etiqueta
      );

    if (
      etiquetasContato.includes(
        etiquetaConsultor
      )
    ) {
      return consultor;
    }
  }


  return null;
}


// ==========================================
// ENVIAR TEXTO
// ==========================================

async function enviarMensagem({
  toPhone,
  message,
  contactName,
}) {
  const token =
    process.env.UMBLER_TOKEN;

  const organizationId =
    process.env
      .UMBLER_ORGANIZATION_ID;

  const fromPhone =
    process.env.CENTRAL_PHONE;


  if (
    !token ||
    !organizationId ||
    !fromPhone
  ) {
    throw new Error(
      "Variáveis da Umbler não configuradas."
    );
  }


  const payload = {
    toPhone,
    fromPhone,
    organizationId,
    message,
    file: null,
    skipReassign: false,
  };


  if (contactName) {
    payload.contactName =
      contactName;
  }


  const resposta =
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
          JSON.stringify(
            payload
          ),
      }
    );


  const respostaTexto =
    await resposta.text();

  let resultado = null;


  if (respostaTexto) {
    try {
      resultado =
        JSON.parse(
          respostaTexto
        );
    } catch {
      resultado =
        respostaTexto;
    }
  }


  return {
    ok: resposta.ok,
    status: resposta.status,
    resultado,
  };
}


// ==========================================
// CONSULTAR MENSAGEM DA UMBLER
// ==========================================

async function obterMensagemUmbler(
  messageId
) {
  const token =
    process.env.UMBLER_TOKEN;

  const organizationId =
    process.env
      .UMBLER_ORGANIZATION_ID;


  const url =
    "https://app-utalk.umbler.com/api/v1/messages/" +
    encodeURIComponent(
      messageId
    ) +
    "/?organizationId=" +
    encodeURIComponent(
      organizationId
    );


  const resposta =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json",
        },
      }
    );


  const respostaTexto =
    await resposta.text();

  let resultado = null;


  if (respostaTexto) {
    try {
      resultado =
        JSON.parse(
          respostaTexto
        );
    } catch {
      resultado =
        respostaTexto;
    }
  }


  return {
    ok: resposta.ok,
    status: resposta.status,
    resultado,
  };
}


// ==========================================
// EXTRAIR STATUS DA MÍDIA
// ==========================================

function analisarMidia(
  mensagem
) {
  const mensagemCompleta =
    mensagem || {};


  const estado =
    String(
      mensagemCompleta
        ?.messageState ||

      mensagemCompleta
        ?.MessageState ||

      ""
    )
      .trim()
      .toLowerCase();


  const arquivo =
    mensagemCompleta?.file ||
    mensagemCompleta?.File ||
    null;


  const thumbnail =
    mensagemCompleta?.thumbnail ||
    mensagemCompleta?.Thumbnail ||
    null;


  const arquivoUrl =
    arquivo?.url ||
    arquivo?.Url ||
    thumbnail?.url ||
    thumbnail?.Url ||
    null;


  const possuiData =
    Boolean(
      arquivo?.data ||
      arquivo?.Data ||
      thumbnail?.data ||
      thumbnail?.Data
    );


  const forwardCount =
    Number(
      mensagemCompleta
        ?.forwardCount ??

      mensagemCompleta
        ?.ForwardCount ??

      0
    );


  return {
    estado,
    arquivo,
    thumbnail,
    arquivoUrl,
    possuiData,
    forwardCount,
  };
}


// ==========================================
// AGUARDAR MÍDIA FICAR PRONTA
// ==========================================
//
// O webhook costuma chegar quando:
//
// MessageState = Processing
//
// Então consultamos novamente algumas vezes.
//
// São 5 tentativas com pequeno intervalo,
// mantendo a resposta do webhook abaixo do
// limite de tempo da Umbler.
//
// ==========================================

async function aguardarMidiaPronta(
  messageId
) {
  const MAX_TENTATIVAS = 5;
  const INTERVALO_MS = 650;

  let ultimaConsulta = null;


  for (
    let tentativa = 1;
    tentativa <= MAX_TENTATIVAS;
    tentativa++
  ) {

    if (tentativa > 1) {
      await esperar(
        INTERVALO_MS
      );
    }


    const consulta =
      await obterMensagemUmbler(
        messageId
      );


    if (!consulta.ok) {
      console.error(
        "ERRO CONSULTA MÍDIA:",
        {
          tentativa,
          messageId,
          status:
            consulta.status,
        }
      );

      ultimaConsulta =
        consulta;

      continue;
    }


    const analise =
      analisarMidia(
        consulta.resultado
      );


    console.log(
      "TENTATIVA MÍDIA:",
      {
        tentativa,
        messageId,
        estado:
          analise.estado,

        possuiArquivoUrl:
          Boolean(
            analise.arquivoUrl
          ),

        possuiData:
          analise.possuiData,

        forwardCount:
          analise.forwardCount,
      }
    );


    ultimaConsulta = {
      ...consulta,
      analise,
    };


    const pronta =
  Boolean(
    analise.arquivoUrl
  ) ||
  analise.possuiData;


    if (pronta) {
      return {
        pronta: true,
        consulta,
        analise,
        tentativa,
      };
    }
  }


  return {
    pronta: false,
    consulta:
      ultimaConsulta,
  };
}


// ==========================================
// FORWARD NATIVO DA UMBLER
// ==========================================

async function encaminharMensagemUmbler(
  messageId,
  chatId
) {
  const token =
    process.env.UMBLER_TOKEN;

  const organizationId =
    process.env
      .UMBLER_ORGANIZATION_ID;


  const url =
    "https://app-utalk.umbler.com/api/v1/messages/" +
    encodeURIComponent(
      messageId
    ) +
    "/forward/";


  const resposta =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            chatId,
            organizationId,
            skipReassign: false,
          }),
      }
    );


  const respostaTexto =
    await resposta.text();

  let resultado = null;


  if (respostaTexto) {
    try {
      resultado =
        JSON.parse(
          respostaTexto
        );
    } catch {
      resultado =
        respostaTexto;
    }
  }


  return {
    ok: resposta.ok,
    status: resposta.status,
    resultado,
  };
}


// ==========================================
// TIPO DA MÍDIA
// ==========================================

function descricaoMidia(tipo) {
  switch (
    String(tipo || "")
      .trim()
      .toLowerCase()
  ) {

    case "audio":
      return {
        emoji: "🎤",
        nome: "Áudio",
      };


    case "image":
      return {
        emoji: "🖼️",
        nome: "Imagem",
      };


    case "video":
      return {
        emoji: "🎥",
        nome: "Vídeo",
      };


    case "file":
      return {
        emoji: "📎",
        nome: "Arquivo",
      };


    case "document":
      return {
        emoji: "📄",
        nome: "Documento",
      };


    case "sticker":
      return {
        emoji: "🖼️",
        nome: "Sticker",
      };


    default:
      return {
        emoji: "📎",
        nome: "Mídia",
      };
  }
}


function tipoMidiaSuportado(tipo) {
  return [
    "audio",
    "image",
    "video",
    "file",
    "document",
    "sticker",
  ].includes(
    String(tipo || "")
      .trim()
      .toLowerCase()
  );
}


// ==========================================
// MARCAR MÍDIA PROCESSADA
// ==========================================

function marcarMidiaProcessada(
  messageId
) {
  midiasProcessadas.add(
    messageId
  );


  if (
    midiasProcessadas.size > 500
  ) {
    const primeiro =
      midiasProcessadas
        .values()
        .next()
        .value;


    if (primeiro) {
      midiasProcessadas.delete(
        primeiro
      );
    }
  }
}


// ==========================================
// HANDLER PRINCIPAL
// ==========================================

export default async function handler(
  req,
  res
) {

  try {

    // ======================================
    // SEGURANÇA
    // ======================================

    const url =
      new URL(
        req.url,
        "https://starke.local"
      );


    const secretRecebido =
      url.searchParams.get(
        "secret"
      );


    const secretCorreto =
      process.env
        .WEBHOOK_SECRET;


    if (
      !secretCorreto ||
      secretRecebido !==
        secretCorreto
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "invalid_secret",
        });
    }


    // ======================================
    // TESTE GET
    // ======================================

    if (
      req.method === "GET"
    ) {
      return res
        .status(200)
        .json({
          received: true,
          route: "retorno",
          status: "online",
        });
    }


    if (
      req.method !== "POST"
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
        });
    }


    // ======================================
    // BODY
    // ======================================

    let body =
      req.body;


    if (
      typeof body === "string"
    ) {
      try {
        body =
          JSON.parse(body);
      } catch {
        return res
          .status(200)
          .json({
            received: true,
            ignored: true,
            reason:
              "invalid_json",
          });
      }
    }


    body =
      body || {};


    // ======================================
    // EVENTO MESSAGE
    // ======================================

    const tipoEvento =
      body.Type ||
      body.type;


    if (
      String(tipoEvento)
        .toLowerCase() !==
      "message"
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "not_message_event",
        });
    }


    // ======================================
    // PAYLOAD UMBLER
    // ======================================

    const conteudoChat =
      body?.Payload?.Content ||
      body?.payload?.content ||
      {};


    const contato =
      conteudoChat?.Contact ||
      conteudoChat?.contact ||
      {};


    const ultimaMensagem =
      conteudoChat
        ?.LastMessage ||
      conteudoChat
        ?.lastMessage ||
      {};


    const telefoneContato =
      normalizarTelefone(
        contato?.PhoneNumber ||
        contato?.phoneNumber
      );


    const nomeContato =
      textoValido(
        contato?.Name ||
        contato?.name
      ) ||
      "Cliente";


    const tags =
      contato?.Tags ||
      contato?.tags ||
      [];


    const mensagemRecebida =
      textoValido(
        ultimaMensagem
          ?.Content ||

        ultimaMensagem
          ?.content
      );


    const source =
      String(
        ultimaMensagem
          ?.Source ||

        ultimaMensagem
          ?.source ||

        ""
      )
        .trim()
        .toLowerCase();


    const messageType =
      String(
        ultimaMensagem
          ?.MessageType ||

        ultimaMensagem
          ?.messageType ||

        "Text"
      )
        .trim()
        .toLowerCase();


    const messageId =
      textoValido(
        ultimaMensagem?.Id ||
        ultimaMensagem?.id
      );


    const messageState =
      String(
        ultimaMensagem
          ?.MessageState ||

        ultimaMensagem
          ?.messageState ||

        ""
      )
        .trim()
        .toLowerCase();


    const isPrivate =
      Boolean(
        ultimaMensagem
          ?.IsPrivate ??

        ultimaMensagem
          ?.isPrivate
      );


    console.log(
      "EVENTO RECEBIDO:",
      {
        telefoneContato,
        nomeContato,
        source,
        messageType,
        messageId,
        messageState,
        isPrivate,

        tags:
          Array.isArray(tags)
            ? tags
                .map(
                  (tag) =>
                    tag?.Name ||
                    tag?.name
                )
                .filter(Boolean)
            : [],

        possuiConteudo:
          Boolean(
            mensagemRecebida
          ),
      }
    );


    // ======================================
    // IGNORAR PRIVADAS
    // ======================================

    if (isPrivate) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "private_message",
        });
    }


    if (!telefoneContato) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "missing_phone",
        });
    }


    // ======================================
    // CONSULTORES
    // ======================================

    const consultores =
      obterConsultoresAutorizados();


    const consultorRemetente =
      consultores.get(
        telefoneContato
      );


    // ======================================
    // CONSULTOR → CLIENTE
    // ======================================

    if (consultorRemetente) {

      if (
        messageType !== "text" ||
        !mensagemRecebida ||
        !mensagemRecebida
          .startsWith("#")
      ) {
        return res
          .status(200)
          .json({
            received: true,
            ignored: true,
            reason:
              "consultant_non_command",
          });
      }


      const comando =
        mensagemRecebida.match(
          /^#\s*(\+?\d{10,15})\s+([\s\S]+)$/
        );


      if (!comando) {

        await enviarMensagem({
          toPhone:
            telefoneContato,

          contactName:
            consultorRemetente
              .nome,

          message:
            `⚠️ ${consultorRemetente.nome}, formato inválido.\n\n` +
            `Use:\n\n` +
            `#TELEFONE mensagem\n\n` +
            `Exemplo:\n` +
            `#5511999999999 Bom dia! Temos essa peça disponível.`,
        });


        return res
          .status(200)
          .json({
            received: true,
            processed: false,
            reason:
              "invalid_command_format",
          });
      }


      const telefoneCliente =
        normalizarTelefone(
          comando[1]
        );


      const mensagemCliente =
        textoValido(
          comando[2]
        );


      if (
        !telefoneCliente ||
        !mensagemCliente
      ) {
        return res
          .status(200)
          .json({
            received: true,
            processed: false,
            reason:
              "invalid_destination",
          });
      }


      const mensagemFinalCliente =
        `*${consultorRemetente.nome}:*\n` +
        `${mensagemCliente}`;


      const envioCliente =
        await enviarMensagem({
          toPhone:
            telefoneCliente,

          message:
            mensagemFinalCliente,
        });


      if (!envioCliente.ok) {
        console.error(
          "ERRO CONSULTOR → CLIENTE:",
          envioCliente
        );


        return res
          .status(200)
          .json({
            received: true,
            processed: false,
            reason:
              "client_send_error",
          });
      }


      await enviarMensagem({
        toPhone:
          telefoneContato,

        contactName:
          consultorRemetente
            .nome,

        message:
          `✅ Resposta enviada ao cliente pela Central.\n\n` +
          `👤 Consultor: ${consultorRemetente.nome}\n` +
          `📱 Cliente: ${telefoneCliente}`,
      });


      return res
        .status(200)
        .json({
          received: true,
          processed: true,
          direction:
            "consultant_to_client",
        });
    }


    // ======================================
    // SOMENTE CLIENTE → CONSULTOR
    // ======================================

    if (
      source !== "contact"
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "not_contact_message",
        });
    }


    const consultorDestino =
      localizarConsultorPorEtiqueta(
        consultores,
        tags
      );


    if (!consultorDestino) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "no_consultant_tag",
        });
    }


    const numeroComando =
      telefoneContato
        .replace(/\D/g, "");


    // ======================================
    // CLIENTE → CONSULTOR
    // TEXTO
    // ======================================

    if (
      messageType === "text"
    ) {

      if (!mensagemRecebida) {
        return res
          .status(200)
          .json({
            received: true,
            ignored: true,
            reason:
              "empty_text",
          });
      }


      const alerta =
        `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

        `👤 *Cliente:* ${nomeContato}\n` +
        `📱 *Telefone:* ${telefoneContato}\n\n` +

        `💬 *Mensagem do cliente:*\n` +
        `${mensagemRecebida}\n\n` +

        `↩️ *Para responder diretamente pela Central:*\n\n` +

        `📋 *Copie e responda:*\n` +
        `#${numeroComando} `;


      const envio =
        await enviarMensagem({
          toPhone:
            consultorDestino
              .telefone,

          contactName:
            consultorDestino
              .nome,

          message:
            alerta,
        });


      return res
        .status(200)
        .json({
          received: true,
          processed:
            envio.ok,

          direction:
            "client_to_consultant_text",
        });
    }


    // ======================================
    // CLIENTE → CONSULTOR
    // MÍDIA
    // ======================================

    if (
      !tipoMidiaSuportado(
        messageType
      )
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "unsupported_message_type",
          messageType,
        });
    }


    if (!messageId) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "missing_message_id",
        });
    }


    if (
      !consultorDestino.chatId
    ) {
      console.error(
        "CONSULTOR SEM CHAT ID:",
        consultorDestino.nome
      );


      return res
        .status(200)
        .json({
          received: true,
          processed: false,
          reason:
            "consultant_chat_id_missing",
        });
    }


    if (
      midiasProcessadas.has(
        messageId
      )
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "media_already_processed_local",
        });
    }


    // ======================================
    // NOVO:
    // AGUARDAR PROCESSAMENTO DA UMBLER
    // ======================================

    const resultadoMidia =
      await aguardarMidiaPronta(
        messageId
      );


    if (
      !resultadoMidia.pronta
    ) {

      console.error(
        "MÍDIA NÃO FICOU PRONTA:",
        {
          messageId,
          consultor:
            consultorDestino.nome,
        }
      );


      return res
        .status(200)
        .json({
          received: true,
          processed: false,
          reason:
            "media_still_processing",
        });
    }


    const mensagemCompleta =
      resultadoMidia
        .consulta
        .resultado;


    const analise =
      resultadoMidia
        .analise;


    // ======================================
    // SE JÁ FOI ENCAMINHADA
    // ======================================

    if (
      analise.forwardCount > 0
    ) {
      marcarMidiaProcessada(
        messageId
      );


      return res
        .status(200)
        .json({
          received: true,
          ignored: true,
          reason:
            "media_already_forwarded",
        });
    }


    const tipoMidia =
      descricaoMidia(
        messageType
      );


    const nomeArquivo =
      analise
        ?.arquivo
        ?.originalName ||

      analise
        ?.arquivo
        ?.OriginalName ||

      analise
        ?.thumbnail
        ?.originalName ||

      analise
        ?.thumbnail
        ?.OriginalName ||

      null;


    // ======================================
    // CABEÇALHO
    // ======================================

    let cabecalho =
      `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

      `👤 *Cliente:* ${nomeContato}\n` +

      `📱 *Telefone:* ${telefoneContato}\n\n` +

      `${tipoMidia.emoji} *${tipoMidia.nome} recebido do cliente:*`;


    if (
      nomeArquivo &&
      (
        messageType === "file" ||
        messageType === "document"
      )
    ) {
      cabecalho +=
        `\n📄 *Arquivo:* ${nomeArquivo}`;
    }


    if (
      mensagemRecebida &&
      messageType === "image"
    ) {
      cabecalho +=
        `\n\n📝 *Legenda:*\n` +
        mensagemRecebida;
    }


    const envioCabecalho =
      await enviarMensagem({
        toPhone:
          consultorDestino.telefone,

        contactName:
          consultorDestino.nome,

        message:
          cabecalho,
      });


    if (!envioCabecalho.ok) {
      return res
        .status(200)
        .json({
          received: true,
          processed: false,
          reason:
            "media_header_error",
        });
    }


    // ======================================
    // FORWARD DA MÍDIA ORIGINAL
    // ======================================

    const forward =
      await encaminharMensagemUmbler(
        messageId,
        consultorDestino.chatId
      );


    if (!forward.ok) {
      console.error(
        "ERRO NO FORWARD:",
        {
          messageId,

          consultor:
            consultorDestino.nome,

          status:
            forward.status,

          resultado:
            forward.resultado,
        }
      );


      return res
        .status(200)
        .json({
          received: true,
          processed: false,
          reason:
            "media_forward_error",
        });
    }


    marcarMidiaProcessada(
      messageId
    );


    // ======================================
    // COMANDO PARA RESPOSTA
    // ======================================

    await enviarMensagem({
      toPhone:
        consultorDestino.telefone,

      contactName:
        consultorDestino.nome,

      message:
        `↩️ *Para responder diretamente pela Central:*\n\n` +

        `📋 *Copie e responda:*\n` +

        `#${numeroComando} `,
    });


    console.log(
      "✅ MÍDIA CLIENTE → CONSULTOR:",
      {
        messageId,

        cliente:
          telefoneContato,

        consultor:
          consultorDestino.nome,

        tipo:
          messageType,

        tentativa:
          resultadoMidia
            .tentativa,
      }
    );


    return res
      .status(200)
      .json({
        received: true,
        processed: true,
        direction:
          "client_to_consultant_media",
        mediaType:
          messageType,
        consultor:
          consultorDestino.nome,
      });


  } catch (error) {

    console.error(
      "ERRO NO RETORNO:",
      error
    );


    return res
      .status(200)
      .json({
        received: true,
        processed: false,
        error: true,
      });
  }
}
