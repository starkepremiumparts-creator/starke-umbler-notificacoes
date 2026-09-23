// ==========================================
// STÄRKE PARTS
// PONTE CENTRAL ↔ CONSULTORES
// TEXTO + MÍDIA
// ==========================================
//
// RETORNO_CONSULTORES:
//
// Nome|WhatsApp|Etiqueta|ChatId
//
// Exemplo:
//
// Igor Alves|+5511999999999|Igor|CHAT_ID_IGOR
// Lucas Evangelista|+5511999999999|Lucas E|CHAT_ID_LUCAS
// Evandro Santos|+5513999999999|Evandro|CHAT_ID_EVANDRO
//
// Consultores que ainda não possuem
// Etiqueta + ChatId também continuam aceitos:
//
// Nome|WhatsApp
//
// ==========================================


// ==========================================
// ANTI-DUPLICAÇÃO DE MÍDIA
// ==========================================
//
// Ajuda a impedir que a mesma mídia seja
// encaminhada mais de uma vez dentro da
// mesma instância da função da Vercel.
//
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


// ==========================================
// NORMALIZAR TELEFONE
// ==========================================

function normalizarTelefone(valor) {
  if (!valor) {
    return null;
  }

  let numero =
    String(valor)
      .replace(/\D/g, "");


  // Se vier somente:
  // DDD + telefone
  //
  // adicionamos o código 55.
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


// ==========================================
// NORMALIZAR TEXTO PARA COMPARAÇÃO
// ==========================================

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
// CADASTRAR CONSULTOR
// ==========================================
//
// IMPORTANTE:
//
// Se um telefone já tiver sido cadastrado
// em RETORNO_CONSULTORES, ele NÃO será
// sobrescrito pelas variáveis antigas
// CONSULTOR_SANTOS_PHONE etc.
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


  const nomeFinal =
    textoValido(nome) ||
    "Consultor Stärke Parts";


  if (
    !consultores.has(
      telefoneNormalizado
    )
  ) {

    consultores.set(
      telefoneNormalizado,
      {
        nome:
          nomeFinal,

        telefone:
          telefoneNormalizado,

        etiqueta:
          textoValido(
            etiqueta
          ),

        chatId:
          textoValido(
            chatId
          ),
      }
    );

  }
}


// ==========================================
// CARREGAR CONSULTORES
// ==========================================
//
// Aceita:
//
// Nome|Telefone|Etiqueta|ChatId
//
// ou:
//
// Nome|Telefone
//
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


    // ======================================
    // Nome|Telefone|Etiqueta|ChatId
    //
    // ou
    //
    // Nome|Telefone
    // ======================================

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


    // ======================================
    // Compatibilidade extrema:
    // somente telefone
    // ======================================

    cadastrarConsultor(
      consultores,
      "Consultor Stärke Parts",
      partes[0],
      null,
      null
    );

  }


  // ========================================
  // COMPATIBILIDADE COM VARIÁVEIS ANTIGAS
  // ========================================
  //
  // Como cadastrarConsultor NÃO sobrescreve
  // telefones existentes, RETORNO_CONSULTORES
  // sempre tem prioridade.
  //
  // ========================================

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


  if (
    !etiquetasContato.length
  ) {
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
// ENVIAR TEXTO VIA CENTRAL
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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// CONSULTAR MENSAGEM DA UMBLER
// ==========================================
//
// Usado principalmente para mídia.
//
// O webhook pode receber:
//
// MessageState: Processing
//
// Depois consultamos pelo ID até a mídia
// estar disponível na API.
//
// ==========================================

async function obterMensagemUmbler(
  messageId
) {

  const token =
    process.env.UMBLER_TOKEN;


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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// FORWARD NATIVO DA UMBLER
// ==========================================
//
// Encaminha a mídia original para o chat
// do consultor.
//
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
    "/forward/";


  const resposta =
    await fetch(
      url,
      {
        method:
          "POST",

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
            skipReassign:
              false,
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
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado,
  };
}


// ==========================================
// DESCRIÇÃO DAS MÍDIAS
// ==========================================

function descricaoMidia(tipo) {

  switch (
    String(tipo || "")
      .trim()
      .toLowerCase()
  ) {

    case "audio":

      return {
        emoji:
          "🎤",

        nome:
          "Áudio",
      };


    case "image":

      return {
        emoji:
          "🖼️",

        nome:
          "Imagem",
      };


    case "video":

      return {
        emoji:
          "🎥",

        nome:
          "Vídeo",
      };


    case "file":

      return {
        emoji:
          "📎",

        nome:
          "Arquivo",
      };


    case "document":

      return {
        emoji:
          "📄",

        nome:
          "Documento",
      };


    case "sticker":

      return {
        emoji:
          "🖼️",

        nome:
          "Sticker",
      };


    default:

      return {
        emoji:
          "📎",

        nome:
          "Mídia",
      };
  }
}


// ==========================================
// TIPOS DE MÍDIA SUPORTADOS
// ==========================================

function tipoMidiaSuportado(
  tipo
) {

  const tipos =
    [
      "audio",
      "image",
      "video",
      "file",
      "document",
      "sticker",
    ];


  return tipos.includes(
    String(tipo || "")
      .trim()
      .toLowerCase()
  );
}


// ==========================================
// MARCAR MÍDIA COMO PROCESSADA
// ==========================================

function marcarMidiaProcessada(
  messageId
) {

  midiasProcessadas.add(
    messageId
  );


  // Evita crescimento infinito
  // da memória da instância.
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
    // 1. SEGURANÇA
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
      process.env.WEBHOOK_SECRET;


    if (
      !secretCorreto ||
      secretRecebido !==
        secretCorreto
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "invalid_secret",
      });

    }


    // ======================================
    // 2. TESTE PELO NAVEGADOR
    // ======================================

    if (
      req.method === "GET"
    ) {

      return res.status(200).json({
        received:
          true,

        route:
          "retorno",

        status:
          "online",
      });

    }


    // ======================================
    // 3. SOMENTE POST
    // ======================================

    if (
      req.method !== "POST"
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,
      });

    }


    // ======================================
    // 4. LER BODY
    // ======================================

    let body =
      req.body;


    if (
      typeof body === "string"
    ) {

      try {

        body =
          JSON.parse(
            body
          );

      } catch {

        return res.status(200).json({
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
    // 5. SOMENTE EVENTO MESSAGE
    // ======================================

    const tipoEvento =
      body.Type ||
      body.type;


    if (
      String(tipoEvento)
        .toLowerCase() !==
      "message"
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "not_message_event",
      });

    }


    // ======================================
    // 6. PAYLOAD REAL DA UMBLER
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
      conteudoChat?.LastMessage ||
      conteudoChat?.lastMessage ||
      {};


    // ======================================
    // 7. DADOS DO CONTATO
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
    // 8. DADOS DA MENSAGEM
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
    // 9. IGNORAR NOTAS PRIVADAS
    // ======================================

    if (isPrivate) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "private_message",
      });

    }


    // ======================================
    // 10. PRECISA TER TELEFONE
    // ======================================

    if (!telefoneContato) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "missing_phone",
      });

    }


    // ======================================
    // 11. CARREGAR CONSULTORES
    // ======================================

    const consultores =
      obterConsultoresAutorizados();


    const consultorRemetente =
      consultores.get(
        telefoneContato
      );


    // ======================================
    // FLUXO 1
    //
    // CONSULTOR → CLIENTE
    // TEXTO
    // ======================================

    if (consultorRemetente) {

      // ====================================
      // Consultor só gera ação quando envia
      // comando começando com #
      // ====================================

      if (
        messageType !== "text" ||
        !mensagemRecebida ||
        !mensagemRecebida
          .startsWith("#")
      ) {

        return res.status(200).json({
          received:
            true,

          ignored:
            true,

          reason:
            "consultant_non_command",
        });

      }


      // ====================================
      // FORMATO:
      //
      // #5511999999999 mensagem
      // ====================================

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


        return res.status(200).json({
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

        return res.status(200).json({
          received:
            true,

          processed:
            false,

          reason:
            "invalid_destination",
        });

      }


      // ====================================
      // MENSAGEM FINAL AO CLIENTE
      // ====================================

      const mensagemFinalCliente =
        `*${consultorRemetente.nome}:*\n` +
        mensagemCliente;


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


        return res.status(200).json({
          received:
            true,

          processed:
            false,

          reason:
            "client_send_error",
        });

      }


      // ====================================
      // CONFIRMAÇÃO PARA CONSULTOR
      // ====================================

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


      console.log(
        "CONSULTOR → CLIENTE:",
        {
          consultor:
            consultorRemetente.nome,

          telefoneConsultor:
            telefoneContato,

          cliente:
            telefoneCliente,
        }
      );


      return res.status(200).json({
        received:
          true,

        processed:
          true,

        direction:
          "consultant_to_client",
      });

    }


    // ======================================
    // DAQUI PARA BAIXO:
    //
    // CLIENTE → CONSULTOR
    // ======================================


    // ======================================
    // 12. SÓ MENSAGEM DO CONTATO
    // ======================================

    if (
      source !== "contact"
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "not_contact_message",
      });

    }


    // ======================================
    // 13. DESCOBRIR CONSULTOR PELA ETIQUETA
    // ======================================

    const consultorDestino =
      localizarConsultorPorEtiqueta(
        consultores,
        tags
      );


    if (!consultorDestino) {

      return res.status(200).json({
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
    // FLUXO 2
    //
    // CLIENTE → CONSULTOR
    // TEXTO
    // ======================================

    if (
      messageType === "text"
    ) {

      if (!mensagemRecebida) {

        return res.status(200).json({
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

        `↩️ *Para responder diretamente pela Central:*\n\n` +

        `📋 *Copie e responda:*\n` +

        `#${numeroComando} `;


      const envio =
        await enviarMensagem({
          toPhone:
            consultorDestino.telefone,

          contactName:
            consultorDestino.nome,

          message:
            alerta,
        });


      if (!envio.ok) {

        console.error(
          "ERRO CLIENTE → CONSULTOR (TEXTO):",
          envio
        );


        return res.status(200).json({
          received:
            true,

          processed:
            false,

          reason:
            "consultant_notification_error",
        });

      }


      console.log(
        "CLIENTE → CONSULTOR (TEXTO):",
        {
          cliente:
            telefoneContato,

          consultor:
            consultorDestino.nome,

          etiqueta:
            consultorDestino.etiqueta,
        }
      );


      return res.status(200).json({
        received:
          true,

        processed:
          true,

        direction:
          "client_to_consultant_text",
      });

    }


    // ======================================
    // FLUXO 3
    //
    // CLIENTE → CONSULTOR
    // MÍDIA
    // ======================================


    // ======================================
    // 14. VALIDAR TIPO
    // ======================================

    if (
      !tipoMidiaSuportado(
        messageType
      )
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "unsupported_message_type",

        messageType,
      });

    }


    // ======================================
    // 15. PRECISA TER MESSAGE ID
    // ======================================

    if (!messageId) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "missing_message_id",
      });

    }


    // ======================================
    // 16. CONSULTOR PRECISA TER CHAT ID
    // ======================================

    if (
      !consultorDestino.chatId
    ) {

      console.error(
        "CONSULTOR SEM CHAT ID:",
        {
          consultor:
            consultorDestino.nome,

          etiqueta:
            consultorDestino.etiqueta,
        }
      );


      return res.status(200).json({
        received:
          true,

        processed:
          false,

        reason:
          "consultant_chat_id_missing",
      });

    }


    // ======================================
    // 17. ANTI-DUPLICAÇÃO
    // ======================================

    if (
      midiasProcessadas.has(
        messageId
      )
    ) {

      return res.status(200).json({
        received:
          true,

        ignored:
          true,

        reason:
          "media_already_processed_local",
      });

    }


    // ======================================
    // 18. CONSULTAR MENSAGEM COMPLETA
    // ======================================

    const consulta =
      await obterMensagemUmbler(
        messageId
      );


    if (!consulta.ok) {

      console.error(
        "ERRO AO CONSULTAR MÍDIA:",
        consulta
      );


      return res.status(200).json({
        received:
          true,

        processed:
          false,

        reason:
          "message_lookup_error",
      });

    }


    const mensagemCompleta =
      consulta.resultado ||
      {};


    const estado =
      String(
        mensagemCompleta
          ?.messageState ||

        mensagemCompleta
          ?.MessageState ||

        messageState ||

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


    console.log(
      "MÍDIA CONSULTADA:",
      {
        messageId,
        estado,

        possuiArquivoUrl:
          Boolean(
            arquivoUrl
          ),

        tipo:
          messageType,

        consultor:
          consultorDestino.nome,
      }
    );


    // ======================================
    // 19. AINDA PROCESSANDO
    // ======================================

    if (
      estado === "processing" ||
      !arquivoUrl
    ) {

      return res.status(200).json({
        received:
          true,

        processed:
          false,

        reason:
          "media_processing",
      });

    }


    // ======================================
    // 20. IDENTIFICAR MÍDIA
    // ======================================

    const tipoMidia =
      descricaoMidia(
        messageType
      );


    const nomeArquivo =
      arquivo?.originalName ||
      arquivo?.OriginalName ||
      thumbnail?.originalName ||
      thumbnail?.OriginalName ||
      null;


    // ======================================
    // 21. CABEÇALHO
    // ======================================

    let cabecalho =
      `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

      `👤 *Cliente:* ${nomeContato}\n` +

      `📱 *Telefone:* ${telefoneContato}\n\n` +

      `${tipoMidia.emoji} *${tipoMidia.nome} recebido do cliente:*`;


    // Documento / PDF
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


    // Foto com legenda
    if (
      mensagemRecebida &&
      messageType === "image"
    ) {

      cabecalho +=
        `\n\n📝 *Legenda:*\n` +
        `${mensagemRecebida}`;

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

      console.error(
        "ERRO NO CABEÇALHO DA MÍDIA:",
        envioCabecalho
      );


      return res.status(200).json({
        received:
          true,

        processed:
          false,

        reason:
          "media_header_error",
      });

    }


    // ======================================
    // 22. ENCAMINHAR MÍDIA ORIGINAL
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


      return res.status(200).json({
        received:
          true,

        processed:
          false,

        reason:
          "media_forward_error",
      });

    }


    // ======================================
    // 23. MARCAR COMO PROCESSADA
    // ======================================

    marcarMidiaProcessada(
      messageId
    );


    // ======================================
    // 24. COMANDO PRONTO PARA RESPOSTA
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
      "MÍDIA CLIENTE → CONSULTOR:",
      {
        messageId,

        cliente:
          telefoneContato,

        consultor:
          consultorDestino.nome,

        etiqueta:
          consultorDestino.etiqueta,

        chatId:
          consultorDestino.chatId,

        tipo:
          messageType,
      }
    );


    return res.status(200).json({
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


    return res.status(200).json({
      received:
        true,

      processed:
        false,

      error:
        true,
    });

  }
}
