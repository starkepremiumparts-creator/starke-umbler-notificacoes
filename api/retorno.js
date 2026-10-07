// ==========================================
// STÄRKE PARTS
// PONTE CENTRAL ↔ CONSULTORES
// TEXTO + MÍDIA EM MÃO DUPLA
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

  return texto.length
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
// CONSULTORES
//
// RETORNO_CONSULTORES:
//
// Nome|WhatsApp|Etiqueta|ChatId
//
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
    }
  }


  // Compatibilidade com variáveis antigas

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
// LOCALIZAR CONSULTOR PELA ETIQUETA
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
// EXTRAIR TELEFONE DE UMA MENSAGEM
//
// ACEITA:
//
// #5511984984178
//
// OU:
//
// 📱 *Telefone:* +5511984984178
//
// ==========================================

function extrairTelefoneDoTexto(
  ...valores
) {
  for (const valor of valores) {
    if (
      typeof valor !== "string"
    ) {
      continue;
    }


    // Remove formatação WhatsApp
    // e caracteres invisíveis.

    const textoLimpo =
      valor
        .replace(
          /[*_~`]/g,
          ""
        )
        .replace(
          /[\u200B-\u200D\uFEFF]/g,
          ""
        );


    // ======================================
    // #5511984984178
    // ======================================

    const porComando =
      textoLimpo.match(
        /#\s*(\+?\d{10,15})/
      );


    if (porComando) {
      const telefone =
        normalizarTelefone(
          porComando[1]
        );


      if (telefone) {
        return telefone;
      }
    }


    // ======================================
    // Telefone: +5511984984178
    // ======================================

    const porRotulo =
      textoLimpo.match(
        /telefone\s*:\s*(\+?\d{10,15})/i
      );


    if (porRotulo) {
      const telefone =
        normalizarTelefone(
          porRotulo[1]
        );


      if (telefone) {
        return telefone;
      }
    }
  }


  return null;
}


// ==========================================
// ENVIAR TEXTO PELA CENTRAL
// ==========================================

async function enviarMensagem({
  toPhone,
  message,
  contactName,
}) {
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
        method:
          "POST",

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


  let resultado =
    null;


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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// CONSULTAR UMA MENSAGEM UMBLER
// ==========================================

async function obterMensagemUmbler(
  messageId
) {
  const token =
    process.env
      .UMBLER_TOKEN;


  const organizationId =
    process.env
      .UMBLER_ORGANIZATION_ID;


  if (
    !token ||
    !organizationId
  ) {
    throw new Error(
      "UMBLER_TOKEN ou UMBLER_ORGANIZATION_ID não configurado."
    );
  }


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
        method:
          "GET",

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


  let resultado =
    null;


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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// ANALISAR MÍDIA
// ==========================================

function analisarMidia(
  mensagem
) {
  const m =
    mensagem || {};


  const arquivo =
    m?.file ||
    m?.File ||
    null;


  const thumbnail =
    m?.thumbnail ||
    m?.Thumbnail ||
    null;


  return {
    estado:
      String(
        m?.messageState ||
        m?.MessageState ||
        ""
      )
        .trim()
        .toLowerCase(),


    arquivo,


    thumbnail,


    arquivoUrl:
      arquivo?.url ||
      arquivo?.Url ||
      null,


    thumbnailUrl:
      thumbnail?.url ||
      thumbnail?.Url ||
      null,


    possuiData:
      Boolean(
        arquivo?.data ||
        arquivo?.Data ||
        thumbnail?.data ||
        thumbnail?.Data
      ),


    forwardCount:
      Number(
        m?.forwardCount ??
        m?.ForwardCount ??
        0
      ),


    contentType:
      arquivo?.contentType ||
      arquivo?.ContentType ||
      null,


    originalName:
      arquivo?.originalName ||
      arquivo?.OriginalName ||
      null,
  };
}


// ==========================================
// AGUARDAR MÍDIA FICAR DISPONÍVEL
// ==========================================
//
// A Umbler pode continuar retornando
// Processing mesmo depois de file.url existir.
//
// ==========================================

async function aguardarMidiaPronta(
  messageId
) {
  const MAX_TENTATIVAS =
    6;


  const INTERVALO_MS =
    500;


  let ultimaConsulta =
    null;


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
      ultimaConsulta =
        consulta;


      console.error(
        "ERRO CONSULTA MÍDIA:",
        {
          tentativa,
          messageId,

          status:
            consulta.status,
        }
      );


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

        possuiThumbnailUrl:
          Boolean(
            analise.thumbnailUrl
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


    // O arquivo já está disponível.
    // Não precisamos esperar sair de Processing.

    if (
      Boolean(
        analise.arquivoUrl
      ) ||
      analise.possuiData
    ) {
      return {
        pronta:
          true,

        consulta,

        analise,

        tentativa,
      };
    }
  }


  return {
    pronta:
      false,

    consulta:
      ultimaConsulta,
  };
}


// ==========================================
// DESCOBRIR CLIENTE PELO InReplyTo
// ==========================================

async function resolverTelefonePorInReplyTo(
  inReplyTo
) {
  let idAtual =
    textoValido(
      inReplyTo?.Id
    ) ||
    textoValido(
      inReplyTo?.id
    );


  const visitados =
    new Set();


  const MAX_NIVEIS =
    5;


  for (
    let nivel = 1;
    nivel <= MAX_NIVEIS;
    nivel++
  ) {
    if (
      !idAtual ||
      visitados.has(
        idAtual
      )
    ) {
      break;
    }


    visitados.add(
      idAtual
    );


    const consulta =
      await obterMensagemUmbler(
        idAtual
      );


    if (
      !consulta.ok ||
      !consulta.resultado
    ) {
      console.error(
        "ERRO AO RESOLVER INREPLYTO:",
        {
          nivel,
          idAtual,

          status:
            consulta.status,
        }
      );


      return {
        telefone:
          null,

        reason:
          "reply_lookup_error",
      };
    }


    const mensagem =
      consulta.resultado;


    const telefone =
      extrairTelefoneDoTexto(
        mensagem?.content,
        mensagem?.Content,

        mensagem?.headerContent,
        mensagem?.HeaderContent,

        mensagem?.footer,
        mensagem?.Footer,

        mensagem?.file?.caption,
        mensagem?.File?.Caption
      );


    console.log(
      "RESOLVENDO INREPLYTO:",
      {
        nivel,

        idAtual,

        encontrouTelefone:
          Boolean(
            telefone
          ),

        telefone:
          telefone ||
          null,

        tipo:
          mensagem?.messageType ||
          mensagem?.MessageType ||
          null,
      }
    );


    if (telefone) {
      return {
        telefone,

        messageId:
          idAtual,
      };
    }


    const proximo =
      mensagem?.inReplyTo ||
      mensagem?.InReplyTo ||
      null;


    idAtual =
      textoValido(
        proximo?.Id
      ) ||
      textoValido(
        proximo?.id
      );
  }


  return {
    telefone:
      null,

    reason:
      "client_phone_not_found_in_reply_chain",
  };
}


// ==========================================
// BAIXAR E REENVIAR ARQUIVO PELA CENTRAL
//
// USADO NOS DOIS SENTIDOS:
// CLIENTE → CONSULTOR
// CONSULTOR → CLIENTE
// ==========================================

async function enviarArquivoSimplificado({
  toPhone,
  fileUrl,
  fileName,
  contentType,
  contactName,
}) {
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
    throw new Error(
      "Variáveis da Umbler não configuradas."
    );
  }


  // ========================================
  // BAIXAR ARQUIVO
  // ========================================

  const download =
    await fetch(
      fileUrl
    );


  if (!download.ok) {
    return {
      ok:
        false,

      status:
        download.status,

      resultado:
        "Falha ao baixar mídia da Umbler.",
    };
  }


  const bytes =
    await download
      .arrayBuffer();


  const mime =
    contentType ||
    download.headers.get(
      "content-type"
    ) ||
    "application/octet-stream";


  const nomeArquivo =
    fileName ||
    "arquivo";


  const blob =
    new Blob(
      [bytes],
      {
        type:
          mime,
      }
    );


  // ========================================
  // MULTIPART
  // ========================================

  const form =
    new FormData();


  form.append(
    "toPhone",
    toPhone
  );


  form.append(
    "fromPhone",
    fromPhone
  );


  form.append(
    "organizationId",
    organizationId
  );


  form.append(
    "skipReassign",
    "false"
  );


  if (contactName) {
    form.append(
      "contactName",
      contactName
    );
  }


  form.append(
    "file",
    blob,
    nomeArquivo
  );


  const resposta =
    await fetch(
      "https://app-utalk.umbler.com/api/v1/messages/simplified/",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        body:
          form,
      }
    );


  const respostaTexto =
    await resposta.text();


  let resultado =
    null;


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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// TIPOS DE MÍDIA
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


function tipoMidiaSuportado(
  tipo
) {
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
// ANTI-DUPLICAÇÃO
// ==========================================

function marcarMidiaProcessada(
  messageId
) {
  midiasProcessadas.add(
    messageId
  );


  if (
    midiasProcessadas.size >
    500
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
// INSTRUÇÃO PARA CONSULTOR
// ==========================================

function mensagemInstrucaoResposta(
  numeroComando
) {
  return (
    `↩️ *Para responder este cliente pela Central:*\n\n` +

    `💬 *Texto:*\n` +
    `#${numeroComando} sua mensagem\n\n` +

    `🎤📷📎 *Áudio, foto, vídeo ou arquivo:*\n` +

    `Use *RESPONDER* nesta mensagem ou no cabeçalho que mostra o telefone do cliente e envie a mídia.`
  );
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
          received:
            true,

          ignored:
            true,

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
          received:
            true,

          route:
            "retorno",

          status:
            "online",
        });
    }


    if (
      req.method !== "POST"
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,
        });
    }


    // ======================================
    // BODY
    // ======================================

    let body =
      req.body;


    if (
      typeof body ===
      "string"
    ) {
      try {
        body =
          JSON.parse(
            body
          );
      } catch {
        return res
          .status(200)
          .json({
            received:
              true,

            ignored:
              true,

            reason:
              "invalid_json",
          });
      }
    }


    body =
      body || {};


    // ======================================
    // EVENTO
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
          received:
            true,

          ignored:
            true,

          reason:
            "not_message_event",
        });
    }


    // ======================================
    // PAYLOAD
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


    // ======================================
    // CONTATO
    // ======================================

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


    // ======================================
    // MENSAGEM
    // ======================================

    const mensagemRecebida =
      textoValido(
        ultimaMensagem?.Content ||
        ultimaMensagem?.content
      );


    const source =
      String(
        ultimaMensagem?.Source ||
        ultimaMensagem?.source ||
        ""
      )
        .trim()
        .toLowerCase();


    const messageType =
      String(
        ultimaMensagem?.MessageType ||
        ultimaMensagem?.messageType ||
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
        ultimaMensagem?.MessageState ||
        ultimaMensagem?.messageState ||
        ""
      )
        .trim()
        .toLowerCase();


    const inReplyTo =
      ultimaMensagem?.InReplyTo ||
      ultimaMensagem?.inReplyTo ||
      null;


    const sentByOrganizationMember =
      ultimaMensagem
        ?.SentByOrganizationMember ||

      ultimaMensagem
        ?.sentByOrganizationMember ||

      null;


    const isPrivate =
      Boolean(
        ultimaMensagem?.IsPrivate ??
        ultimaMensagem?.isPrivate
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

        possuiInReplyTo:
          Boolean(
            inReplyTo
          ),

        inReplyToId:
          inReplyTo?.Id ||
          inReplyTo?.id ||
          null,

        inReplyToChatId:
          inReplyTo?.ChatId ||
          inReplyTo?.chatId ||
          null,

        sentByOrganizationMember:
          Boolean(
            sentByOrganizationMember
          ),

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


    if (isPrivate) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

          reason:
            "private_message",
        });
    }


    if (!telefoneContato) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

          reason:
            "missing_phone",
        });
    }


    const consultores =
      obterConsultoresAutorizados();


    const consultorRemetente =
      consultores.get(
        telefoneContato
      );


    // =============================================================
    // CONSULTOR → CLIENTE
    // =============================================================

    if (consultorRemetente) {

      // ====================================
      // TEXTO CONSULTOR → CLIENTE
      // ====================================

      if (
        messageType ===
        "text"
      ) {
        if (
          !mensagemRecebida ||
          !mensagemRecebida
            .startsWith("#")
        ) {
          return res
            .status(200)
            .json({
              received:
                true,

              ignored:
                true,

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
              consultorRemetente.nome,

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
              received:
                true,

              processed:
                false,

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
              received:
                true,

              processed:
                false,

              reason:
                "invalid_destination",
            });
        }


        const envioCliente =
          await enviarMensagem({
            toPhone:
              telefoneCliente,

            message:
              `*${consultorRemetente.nome}:*\n${mensagemCliente}`,
          });


        if (!envioCliente.ok) {
          console.error(
            "ERRO CONSULTOR → CLIENTE:",
            envioCliente
          );


          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "client_send_error",
            });
        }


        await enviarMensagem({
          toPhone:
            telefoneContato,

          contactName:
            consultorRemetente.nome,

          message:
            `✅ Resposta enviada ao cliente pela Central.\n\n` +

            `👤 Consultor: ${consultorRemetente.nome}\n` +

            `📱 Cliente: ${telefoneCliente}`,
        });


        return res
          .status(200)
          .json({
            received:
              true,

            processed:
              true,

            direction:
              "consultant_to_client_text",
          });
      }


      // ====================================
      // MÍDIA CONSULTOR → CLIENTE
      // ====================================

      if (
        tipoMidiaSuportado(
          messageType
        )
      ) {

        // Evita processar mídia enviada
        // pela própria Central.

        if (
          source !==
            "contact" ||
          sentByOrganizationMember
        ) {
          return res
            .status(200)
            .json({
              received:
                true,

              ignored:
                true,

              reason:
                "consultant_media_not_incoming_contact",
            });
        }


        if (!messageId) {
          return res
            .status(200)
            .json({
              received:
                true,

              ignored:
                true,

              reason:
                "missing_message_id",
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
              received:
                true,

              ignored:
                true,

              reason:
                "media_already_processed_local",
            });
        }


        if (!inReplyTo) {
          await enviarMensagem({
            toPhone:
              telefoneContato,

            contactName:
              consultorRemetente.nome,

            message:
              `⚠️ Não consegui identificar para qual cliente enviar essa mídia.\n\n` +

              `Use *RESPONDER* na mensagem da Central que mostra *Telefone:* ou *#TELEFONE* e envie a mídia.`,
          });


          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "media_without_reply_reference",
            });
        }


        // ==================================
        // DESCOBRIR CLIENTE
        // ==================================

        const destino =
          await resolverTelefonePorInReplyTo(
            inReplyTo
          );


        if (!destino.telefone) {
          await enviarMensagem({
            toPhone:
              telefoneContato,

            contactName:
              consultorRemetente.nome,

            message:
              `⚠️ Não consegui identificar o cliente dessa resposta.\n\n` +

              `Para enviar mídia pela Central, use *RESPONDER* na mensagem que mostra *Telefone:* ou *#TELEFONE* do cliente e envie o áudio, foto, vídeo ou arquivo.`,
          });


          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                destino.reason ||
                "client_not_resolved",
            });
        }


        console.log(
          "DESTINO DA MÍDIA RESOLVIDO:",
          {
            consultor:
              consultorRemetente.nome,

            cliente:
              destino.telefone,

            replyMessageId:
              destino.messageId ||
              null,
          }
        );


        // ==================================
        // AGUARDAR MÍDIA
        // ==================================

        const resultadoMidia =
          await aguardarMidiaPronta(
            messageId
          );


        if (
          !resultadoMidia.pronta
        ) {
          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "consultant_media_still_processing",
            });
        }


        const analise =
          resultadoMidia
            .analise;


        const fileUrl =
          analise.arquivoUrl;


        if (!fileUrl) {
          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "consultant_media_without_url",
            });
        }


        // ==================================
        // NOME DO CONSULTOR PARA CLIENTE
        // ==================================

        const identificacao =
          await enviarMensagem({
            toPhone:
              destino.telefone,

            message:
              `*${consultorRemetente.nome}:*`,
          });


        if (!identificacao.ok) {
          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "consultant_identity_send_error",
            });
        }


        // ==================================
        // MÍDIA PARA O CLIENTE
        // ==================================

        const envioArquivo =
          await enviarArquivoSimplificado({
            toPhone:
              destino.telefone,

            fileUrl,

            fileName:
              analise.originalName ||
              "arquivo",

            contentType:
              analise.contentType,
          });


        if (!envioArquivo.ok) {
          console.error(
            "ERRO MÍDIA CONSULTOR → CLIENTE:",
            {
              consultor:
                consultorRemetente.nome,

              cliente:
                destino.telefone,

              status:
                envioArquivo.status,

              resultado:
                envioArquivo.resultado,
            }
          );


          await enviarMensagem({
            toPhone:
              telefoneContato,

            contactName:
              consultorRemetente.nome,

            message:
              `⚠️ Não consegui enviar a mídia ao cliente pela Central. Tente novamente em alguns instantes.`,
          });


          return res
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              reason:
                "consultant_media_send_error",
            });
        }


        marcarMidiaProcessada(
          messageId
        );


        // ==================================
        // CONFIRMAR PARA CONSULTOR
        // ==================================

        await enviarMensagem({
          toPhone:
            telefoneContato,

          contactName:
            consultorRemetente.nome,

          message:
            `✅ Mídia enviada ao cliente pela Central.\n\n` +

            `👤 Consultor: ${consultorRemetente.nome}\n` +

            `📱 Cliente: ${destino.telefone}`,
        });


        console.log(
          "✅ MÍDIA CONSULTOR → CLIENTE:",
          {
            messageId,

            consultor:
              consultorRemetente.nome,

            cliente:
              destino.telefone,

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
            received:
              true,

            processed:
              true,

            direction:
              "consultant_to_client_media",

            mediaType:
              messageType,

            consultor:
              consultorRemetente.nome,

            cliente:
              destino.telefone,
          });
      }


      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

          reason:
            "consultant_unsupported_message_type",
        });
    }


    // =============================================================
    // CLIENTE → CONSULTOR
    // =============================================================

    if (
      source !==
      "contact"
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

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
          received:
            true,

          ignored:
            true,

          reason:
            "no_consultant_tag",
        });
    }


    const numeroComando =
      telefoneContato
        .replace(
          /\D/g,
          ""
        );


    // ======================================
    // TEXTO CLIENTE → CONSULTOR
    // ======================================

    if (
      messageType ===
      "text"
    ) {
      if (!mensagemRecebida) {
        return res
          .status(200)
          .json({
            received:
              true,

            ignored:
              true,

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

        mensagemInstrucaoResposta(
          numeroComando
        );


      const envio =
        await enviarMensagem({
          toPhone:
            consultorDestino.telefone,

          contactName:
            consultorDestino.nome,

          message:
            alerta,
        });


      return res
        .status(200)
        .json({
          received:
            true,

          processed:
            envio.ok,

          direction:
            "client_to_consultant_text",
        });
    }


    // ======================================
    // MÍDIA CLIENTE → CONSULTOR
    //
    // NÃO USAMOS MAIS /forward/
    //
    // A mídia é baixada e reenviada como
    // mensagem normal da Central.
    //
    // Objetivo:
    // aparecer no WhatsApp E no Umbler
    // do consultor.
    // ======================================

    if (
      !tipoMidiaSuportado(
        messageType
      )
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

          reason:
            "unsupported_message_type",

          messageType,
        });
    }


    if (!messageId) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            true,

          reason:
            "missing_message_id",
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
          received:
            true,

          ignored:
            true,

          reason:
            "media_already_processed_local",
        });
    }


    // ======================================
    // AGUARDAR MÍDIA ORIGINAL
    // ======================================

    const resultadoMidia =
      await aguardarMidiaPronta(
        messageId
      );


    if (
      !resultadoMidia.pronta
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          processed:
            false,

          reason:
            "media_still_processing",
        });
    }


    const analise =
      resultadoMidia
        .analise;


    const fileUrl =
      analise.arquivoUrl;


    if (!fileUrl) {
      console.error(
        "MÍDIA CLIENTE SEM URL DE ARQUIVO:",
        {
          messageId,

          cliente:
            telefoneContato,

          consultor:
            consultorDestino.nome,

          tipo:
            messageType,
        }
      );


      return res
        .status(200)
        .json({
          received:
            true,

          processed:
            false,

          reason:
            "client_media_without_url",
        });
    }


    const tipoMidia =
      descricaoMidia(
        messageType
      );


    // ======================================
    // 1. CABEÇALHO PARA CONSULTOR
    // ======================================

    let cabecalho =
      `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

      `👤 *Cliente:* ${nomeContato}\n` +

      `📱 *Telefone:* ${telefoneContato}\n\n` +

      `${tipoMidia.emoji} *${tipoMidia.nome} recebido do cliente:*`;


    if (
      analise.originalName &&
      (
        messageType ===
          "file" ||
        messageType ===
          "document"
      )
    ) {
      cabecalho +=
        `\n📄 *Arquivo:* ${analise.originalName}`;
    }


    if (
      mensagemRecebida &&
      messageType ===
        "image"
    ) {
      cabecalho +=
        `\n\n📝 *Legenda:*\n${mensagemRecebida}`;
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


    if (
      !envioCabecalho.ok
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          processed:
            false,

          reason:
            "media_header_error",
        });
    }


    // ======================================
    // 2. MÍDIA COMO MENSAGEM NORMAL
    //    CENTRAL → CONSULTOR
    // ======================================

    const envioMidiaConsultor =
      await enviarArquivoSimplificado({
        toPhone:
          consultorDestino.telefone,

        fileUrl,

        fileName:
          analise.originalName ||
          "arquivo",

        contentType:
          analise.contentType,

        contactName:
          consultorDestino.nome,
      });


    if (
      !envioMidiaConsultor.ok
    ) {
      console.error(
        "ERRO MÍDIA CLIENTE → CONSULTOR:",
        {
          messageId,

          cliente:
            telefoneContato,

          consultor:
            consultorDestino.nome,

          status:
            envioMidiaConsultor.status,

          resultado:
            envioMidiaConsultor.resultado,
        }
      );


      return res
        .status(200)
        .json({
          received:
            true,

          processed:
            false,

          reason:
            "client_media_send_error",
        });
    }


    marcarMidiaProcessada(
      messageId
    );


    // ======================================
    // 3. INSTRUÇÃO DE RESPOSTA
    // ======================================

    await enviarMensagem({
      toPhone:
        consultorDestino.telefone,

      contactName:
        consultorDestino.nome,

      message:
        mensagemInstrucaoResposta(
          numeroComando
        ),
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

        metodo:
          "simplified_multipart",
      }
    );


    return res
      .status(200)
      .json({
        received:
          true,

        processed:
          true,

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
        received:
          true,

        processed:
          false,

        error:
          true,
      });
  }
}
