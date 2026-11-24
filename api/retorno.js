// ==========================================
// STÄRKE PARTS
// CENTRAL ↔ CONSULTORES
//
// TEXTO + ÁUDIO + IMAGEM + VÍDEO + ARQUIVOS
// DEDUPLICAÇÃO PERSISTENTE COM SUPABASE
// ==========================================


// ==========================================
// CONFIGURAÇÕES
// ==========================================

const ESPERA_APOS_ENVIO_MIDIA_MS = 4000;


// Segunda camada de proteção local.
// O Supabase continua sendo a trava principal.
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


async function lerResposta(resposta) {
  const texto =
    await resposta.text();


  if (!texto) {
    return null;
  }


  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}


// ==========================================
// SUPABASE
// ==========================================
//
// IMPORTANTE:
//
// sb_secret_... NÃO é JWT.
//
// Portanto usamos:
//
// apikey: SUPABASE_SECRET_KEY
//
// e NÃO:
//
// Authorization: Bearer sb_secret_...
//
// ==========================================

async function chamarRpcSupabase(
  funcao,
  parametros = {}
) {
  const supabaseUrl =
    textoValido(
      process.env.SUPABASE_URL
    );


  const supabaseSecret =
    textoValido(
      process.env.SUPABASE_SECRET_KEY
    );


  if (
    !supabaseUrl ||
    !supabaseSecret
  ) {
    return {
      ok: false,
      status: 0,
      resultado: null,
      erro:
        "SUPABASE_URL ou SUPABASE_SECRET_KEY ausente.",
    };
  }


  const baseUrl =
    supabaseUrl.replace(
      /\/+$/,
      ""
    );


  try {
    const resposta =
      await fetch(
        `${baseUrl}/rest/v1/rpc/${funcao}`,
        {
          method: "POST",

          headers: {
            apikey:
              supabaseSecret,

            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body:
            JSON.stringify(
              parametros
            ),
        }
      );


    const resultado =
      await lerResposta(
        resposta
      );


    return {
      ok:
        resposta.ok,

      status:
        resposta.status,

      resultado,

      erro:
        resposta.ok
          ? null
          : resultado,
    };

  } catch (erro) {
    return {
      ok: false,
      status: 0,
      resultado: null,

      erro:
        erro?.message ||
        String(erro),
    };
  }
}


// ==========================================
// ASSUMIR PROCESSAMENTO
// ==========================================

async function assumirWebhook(
  messageId
) {
  const resposta =
    await chamarRpcSupabase(
      "claim_umbler_webhook",
      {
        p_message_id:
          messageId,
      }
    );


  if (!resposta.ok) {
    console.error(
      "❌ ERRO SUPABASE CLAIM:",
      {
        messageId,

        status:
          resposta.status,

        erro:
          resposta.erro,
      }
    );


    return {
      ok: false,
      claimed: false,
    };
  }


  const claimed =
    resposta.resultado === true;


  console.log(
    "🔐 DEDUPE CLAIM:",
    {
      messageId,
      claimed,
    }
  );


  return {
    ok: true,
    claimed,
  };
}


// ==========================================
// MARCAR CONCLUÍDO
// ==========================================

async function concluirWebhook(
  messageId
) {
  const resposta =
    await chamarRpcSupabase(
      "complete_umbler_webhook",
      {
        p_message_id:
          messageId,
      }
    );


  if (!resposta.ok) {
    console.error(
      "⚠️ ERRO SUPABASE COMPLETE:",
      {
        messageId,

        status:
          resposta.status,

        erro:
          resposta.erro,
      }
    );


    return false;
  }


  console.log(
    "✅ DEDUPE COMPLETE:",
    {
      messageId,
    }
  );


  return true;
}


// ==========================================
// LIBERAR PROCESSAMENTO
// ==========================================
//
// Usado somente quando ainda não começamos
// a enviar o conteúdo e queremos permitir
// uma nova tentativa posterior.
//
// ==========================================

async function liberarWebhook(
  messageId
) {
  const resposta =
    await chamarRpcSupabase(
      "release_umbler_webhook",
      {
        p_message_id:
          messageId,
      }
    );


  if (!resposta.ok) {
    console.error(
      "⚠️ ERRO SUPABASE RELEASE:",
      {
        messageId,

        status:
          resposta.status,

        erro:
          resposta.erro,
      }
    );


    return false;
  }


  console.log(
    "🔓 DEDUPE RELEASE:",
    {
      messageId,
    }
  );


  return true;
}


// ==========================================
// CONSULTORES
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


  // RETORNO_CONSULTORES
  // tem prioridade sobre variáveis antigas.
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


    if (
      partes.length >= 2
    ) {
      cadastrarConsultor(
        consultores,
        partes[0],
        partes[1],
        partes[2] || null,
        partes[3] || null
      );
    }
  }


  // ========================================
  // COMPATIBILIDADE COM VARIÁVEIS ANTIGAS
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
// EXTRAIR TELEFONE
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


    // #5511...

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


    // Telefone: +5511...

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
// UMBLER
// ENVIAR TEXTO
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


  return {
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado:
      await lerResposta(
        resposta
      ),
  };
}


// ==========================================
// UMBLER
// OBTER MENSAGEM
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
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json",
        },
      }
    );


  return {
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado:
      await lerResposta(
        resposta
      ),
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


  const arquivoData =
    textoValido(
      arquivo?.data ||
      arquivo?.Data
    );


  const thumbnailData =
    textoValido(
      thumbnail?.data ||
      thumbnail?.Data
    );


  const legenda =
    textoValido(
      arquivo?.caption ||
      arquivo?.Caption
    );


  const arquivoUrl =
    arquivo?.url ||
    arquivo?.Url ||
    null;


  const thumbnailUrl =
    thumbnail?.url ||
    thumbnail?.Url ||
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


    arquivoUrl,
    arquivoData,


    possuiArquivoOriginal:
      Boolean(
        arquivoUrl ||
        arquivoData
      ),


    thumbnailUrl,
    thumbnailData,


    possuiThumbnail:
      Boolean(
        thumbnailUrl ||
        thumbnailData
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


    legenda,
  };
}


// ==========================================
// AGUARDAR MÍDIA ORIGINAL
// ==========================================

async function aguardarMidiaOriginal(
  messageId,
  mensagemInicial = null
) {
  const MAX_TENTATIVAS =
    15;


  const INTERVALO_MS =
    1000;


  let ultimaConsulta =
    null;


  if (mensagemInicial) {
    const inicial =
      analisarMidia(
        mensagemInicial
      );


    console.log(
      "MÍDIA NO WEBHOOK:",
      {
        messageId,

        estado:
          inicial.estado,

        possuiArquivoUrl:
          Boolean(
            inicial.arquivoUrl
          ),

        possuiArquivoData:
          Boolean(
            inicial.arquivoData
          ),

        possuiThumbnailUrl:
          Boolean(
            inicial.thumbnailUrl
          ),

        possuiThumbnailData:
          Boolean(
            inicial.thumbnailData
          ),
      }
    );


    if (
      inicial
        .possuiArquivoOriginal
    ) {
      return {
        pronta: true,
        analise: inicial,
        tentativa: 0,
        origemConsulta:
          "webhook",
      };
    }
  }


  for (
    let tentativa = 1;
    tentativa <= MAX_TENTATIVAS;
    tentativa++
  ) {
    if (
      tentativa > 1
    ) {
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


    ultimaConsulta = {
      ...consulta,
      analise,
    };


    console.log(
      "TENTATIVA MÍDIA ORIGINAL:",
      {
        tentativa,
        messageId,

        estado:
          analise.estado,

        possuiArquivoUrl:
          Boolean(
            analise.arquivoUrl
          ),

        possuiArquivoData:
          Boolean(
            analise.arquivoData
          ),

        possuiThumbnailUrl:
          Boolean(
            analise.thumbnailUrl
          ),

        possuiThumbnailData:
          Boolean(
            analise.thumbnailData
          ),

        thumbnailIgnorada:
          analise.possuiThumbnail &&
          !analise
            .possuiArquivoOriginal,

        forwardCount:
          analise.forwardCount,
      }
    );


    if (
      analise
        .possuiArquivoOriginal
    ) {
      return {
        pronta: true,
        consulta,
        analise,
        tentativa,

        origemConsulta:
          "api",
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
// MIME PADRÃO
// ==========================================

function mimePadraoPorTipo(
  tipo
) {
  switch (
    String(tipo || "")
      .trim()
      .toLowerCase()
  ) {
    case "image":
      return "image/jpeg";

    case "audio":
      return "audio/mpeg";

    case "video":
      return "video/mp4";

    case "sticker":
      return "image/webp";

    default:
      return "application/octet-stream";
  }
}


// ==========================================
// NOME PADRÃO
// ==========================================

function nomePadraoPorTipo(
  tipo,
  contentType
) {
  const tipoNormalizado =
    String(tipo || "")
      .trim()
      .toLowerCase();


  const mime =
    String(contentType || "")
      .trim()
      .toLowerCase();


  if (
    tipoNormalizado ===
    "image"
  ) {
    if (mime.includes("png")) {
      return "imagem.png";
    }

    if (mime.includes("webp")) {
      return "imagem.webp";
    }

    return "imagem.jpg";
  }


  if (
    tipoNormalizado ===
    "audio"
  ) {
    if (mime.includes("ogg")) {
      return "audio.ogg";
    }

    if (mime.includes("wav")) {
      return "audio.wav";
    }

    if (
      mime.includes("mp4") ||
      mime.includes("m4a")
    ) {
      return "audio.m4a";
    }

    return "audio.mp3";
  }


  if (
    tipoNormalizado ===
    "video"
  ) {
    return "video.mp4";
  }


  if (
    tipoNormalizado ===
    "sticker"
  ) {
    return "sticker.webp";
  }


  return "arquivo";
}


// ==========================================
// FONTE ORIGINAL DA MÍDIA
// ==========================================

function obterFonteMidiaOriginal(
  analise,
  messageType
) {
  if (!analise) {
    return null;
  }


  const contentType =
    analise.contentType ||
    mimePadraoPorTipo(
      messageType
    );


  const fileName =
    analise.originalName ||
    nomePadraoPorTipo(
      messageType,
      contentType
    );


  if (
    analise.arquivoUrl
  ) {
    return {
      tipo: "url",
      origem: "file.url",

      valor:
        analise.arquivoUrl,

      contentType,
      fileName,
    };
  }


  if (
    analise.arquivoData
  ) {
    return {
      tipo: "base64",
      origem: "file.data",

      valor:
        analise.arquivoData,

      contentType,
      fileName,
    };
  }


  return null;
}


// ==========================================
// BASE64
// ==========================================

function decodificarBase64(
  data,
  contentTypePadrao
) {
  let base64 =
    String(data || "")
      .trim();


  let contentType =
    contentTypePadrao ||
    "application/octet-stream";


  const dataUri =
    base64.match(
      /^data:([^;,]+);base64,([\s\S]+)$/i
    );


  if (dataUri) {
    contentType =
      dataUri[1] ||
      contentType;


    base64 =
      dataUri[2];
  }


  base64 =
    base64.replace(
      /\s/g,
      ""
    );


  if (!base64) {
    throw new Error(
      "Base64 da mídia está vazio."
    );
  }


  const bytes =
    Buffer.from(
      base64,
      "base64"
    );


  if (!bytes.length) {
    throw new Error(
      "Não foi possível decodificar a mídia Base64."
    );
  }


  return {
    bytes,
    contentType,
  };
}


// ==========================================
// ENVIAR ARQUIVO
// ==========================================

async function enviarArquivoSimplificado({
  toPhone,
  fileUrl = null,
  fileData = null,
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


  let bytes =
    null;


  let mime =
    contentType ||
    "application/octet-stream";


  if (fileUrl) {
    const download =
      await fetch(
        fileUrl
      );


    if (!download.ok) {
      return {
        ok: false,

        status:
          download.status,

        resultado:
          "Falha ao baixar mídia original da Umbler.",
      };
    }


    bytes =
      Buffer.from(
        await download
          .arrayBuffer()
      );


    mime =
      contentType ||

      download.headers.get(
        "content-type"
      ) ||

      mime;
  }


  else if (fileData) {
    try {
      const decodificado =
        decodificarBase64(
          fileData,
          mime
        );


      bytes =
        decodificado.bytes;


      mime =
        decodificado.contentType;
    }

    catch (erro) {
      return {
        ok: false,
        status: 0,

        resultado:
          erro?.message ||
          "Falha ao decodificar mídia Base64.",
      };
    }
  }


  else {
    return {
      ok: false,
      status: 0,

      resultado:
        "Arquivo original indisponível.",
    };
  }


  const blob =
    new Blob(
      [bytes],
      {
        type: mime,
      }
    );


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
    fileName ||
    "arquivo"
  );


  const resposta =
    await fetch(
      "https://app-utalk.umbler.com/api/v1/messages/simplified/",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        body:
          form,
      }
    );


  return {
    ok:
      resposta.ok,

    status:
      resposta.status,

    resultado:
      await lerResposta(
        resposta
      ),
  };
}


// ==========================================
// RESOLVER CLIENTE PELO InReplyTo
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
      return {
        telefone: null,

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
    telefone: null,

    reason:
      "client_phone_not_found_in_reply_chain",
  };
}


// ==========================================
// MÍDIA
// ==========================================

function descricaoMidia(
  tipo
) {
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
// ANTI-DUPLICAÇÃO LOCAL SECUNDÁRIA
// ==========================================

function marcarMidiaProcessadaLocal(
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
// INSTRUÇÃO
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
// PROCESSAMENTO PRINCIPAL DA MENSAGEM
// ==========================================
//
// Essa função NÃO responde HTTP.
//
// Ela retorna:
//
// {
//   body: {...},
//   liberarDedupe: false
// }
//
// ==========================================

async function processarMensagem(
  body
) {
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


  // ========================================
  // CONTATO
  // ========================================

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


  // ========================================
  // MENSAGEM
  // ========================================

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

      possuiInReplyTo:
        Boolean(
          inReplyTo
        ),

      isPrivate,
    }
  );


  if (
    isPrivate ||
    !telefoneContato
  ) {
    return {
      body: {
        received: true,
        ignored: true,
      },
    };
  }


  const consultores =
    obterConsultoresAutorizados();


  const consultorRemetente =
    consultores.get(
      telefoneContato
    );


  // ==========================================================
  // CONSULTOR → CLIENTE
  // ==========================================================

  if (consultorRemetente) {

    // ======================================
    // TEXTO
    // ======================================

    if (
      messageType ===
      "text"
    ) {
      if (
        !mensagemRecebida ||
        !mensagemRecebida
          .startsWith("#")
      ) {
        return {
          body: {
            received: true,
            ignored: true,

            reason:
              "consultant_non_command",
          },
        };
      }


      const comando =
        mensagemRecebida.match(
          /^#\s*(\+?\d{10,15})\s+([\s\S]+)$/
        );


      if (!comando) {
        return {
          body: {
            received: true,
            processed: false,

            reason:
              "invalid_command_format",
          },
        };
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
        return {
          body: {
            received: true,
            processed: false,

            reason:
              "invalid_destination",
          },
        };
      }


      const envio =
        await enviarMensagem({
          toPhone:
            telefoneCliente,

          message:
            `*${consultorRemetente.nome}:*\n${mensagemCliente}`,
        });


      if (!envio.ok) {
        return {
          body: {
            received: true,
            processed: false,

            reason:
              "client_send_error",
          },
        };
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


      return {
        body: {
          received: true,
          processed: true,

          direction:
            "consultant_to_client_text",
        },
      };
    }


    // ======================================
    // MÍDIA CONSULTOR → CLIENTE
    // ======================================

    if (
      tipoMidiaSuportado(
        messageType
      )
    ) {
      if (
        source !== "contact" ||
        sentByOrganizationMember
      ) {
        return {
          body: {
            received: true,
            ignored: true,

            reason:
              "consultant_media_not_incoming_contact",
          },
        };
      }


      if (
        !messageId ||
        !inReplyTo
      ) {
        return {
          body: {
            received: true,
            processed: false,

            reason:
              "consultant_media_missing_reference",
          },
        };
      }


      const destino =
        await resolverTelefonePorInReplyTo(
          inReplyTo
        );


      if (!destino.telefone) {
        return {
          body: {
            received: true,
            processed: false,

            reason:
              destino.reason ||
              "client_not_resolved",
          },
        };
      }


      const resultadoMidia =
        await aguardarMidiaOriginal(
          messageId,
          ultimaMensagem
        );


      // Aqui ainda não enviamos nada.
      // Pode liberar o ID para uma
      // tentativa futura.
      if (
        !resultadoMidia.pronta
      ) {
        return {
          liberarDedupe: true,

          body: {
            received: true,
            processed: false,

            reason:
              "consultant_original_media_not_available",
          },
        };
      }


      const fonte =
        obterFonteMidiaOriginal(
          resultadoMidia.analise,
          messageType
        );


      if (!fonte) {
        return {
          liberarDedupe: true,

          body: {
            received: true,
            processed: false,

            reason:
              "consultant_media_without_original_source",
          },
        };
      }


      await enviarMensagem({
        toPhone:
          destino.telefone,

        message:
          `*${consultorRemetente.nome}:*`,
      });


      const envioArquivo =
        await enviarArquivoSimplificado({
          toPhone:
            destino.telefone,

          fileUrl:
            fonte.tipo === "url"
              ? fonte.valor
              : null,

          fileData:
            fonte.tipo === "base64"
              ? fonte.valor
              : null,

          fileName:
            fonte.fileName,

          contentType:
            fonte.contentType,
        });


      if (!envioArquivo.ok) {
        // O nome do consultor já pode ter
        // sido enviado.
        //
        // NÃO liberamos o dedupe para evitar
        // duplicar essa mensagem.
        return {
          body: {
            received: true,
            processed: false,

            reason:
              "consultant_media_send_error",
          },
        };
      }


      marcarMidiaProcessadaLocal(
        messageId
      );


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


      return {
        body: {
          received: true,
          processed: true,

          direction:
            "consultant_to_client_media",
        },
      };
    }


    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "consultant_unsupported_message_type",
      },
    };
  }


  // ==========================================================
  // CLIENTE → CONSULTOR
  // ==========================================================

  if (
    source !==
    "contact"
  ) {
    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "not_contact_message",
      },
    };
  }


  const consultorDestino =
    localizarConsultorPorEtiqueta(
      consultores,
      tags
    );


  if (!consultorDestino) {
    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "no_consultant_tag",
      },
    };
  }


  const numeroComando =
    telefoneContato
      .replace(
        /\D/g,
        ""
      );


  // ========================================
  // TEXTO CLIENTE → CONSULTOR
  // ========================================

  if (
    messageType ===
    "text"
  ) {
    if (!mensagemRecebida) {
      return {
        body: {
          received: true,
          ignored: true,

          reason:
            "empty_text",
        },
      };
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


    return {
      body: {
        received: true,

        processed:
          envio.ok,

        direction:
          "client_to_consultant_text",
      },
    };
  }


  // ========================================
  // MÍDIA CLIENTE → CONSULTOR
  // ========================================

  if (
    !tipoMidiaSuportado(
      messageType
    )
  ) {
    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "unsupported_message_type",
      },
    };
  }


  if (!messageId) {
    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "missing_message_id",
      },
    };
  }


  // ========================================
  // SEGUNDA PROTEÇÃO LOCAL
  // ========================================

  if (
    midiasProcessadas.has(
      messageId
    )
  ) {
    return {
      body: {
        received: true,
        ignored: true,

        reason:
          "media_already_processed_local",
      },
    };
  }


  // ========================================
  // AGUARDAR ORIGINAL
  // ========================================

  const resultadoMidia =
    await aguardarMidiaOriginal(
      messageId,
      ultimaMensagem
    );


  // Nenhum cabeçalho foi enviado ainda.
  // Pode liberar o Supabase para nova
  // tentativa.
  if (
    !resultadoMidia.pronta
  ) {
    return {
      liberarDedupe: true,

      body: {
        received: true,
        processed: false,

        reason:
          "original_media_not_available",
      },
    };
  }


  const analise =
    resultadoMidia
      .analise;


  const fonte =
    obterFonteMidiaOriginal(
      analise,
      messageType
    );


  if (!fonte) {
    return {
      liberarDedupe: true,

      body: {
        received: true,
        processed: false,

        reason:
          "media_without_original_source",
      },
    };
  }


  const tipoMidia =
    descricaoMidia(
      messageType
    );


  // ========================================
  // 1. CABEÇALHO
  // ========================================

  let cabecalho =
    `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

    `👤 *Cliente:* ${nomeContato}\n` +

    `📱 *Telefone:* ${telefoneContato}\n\n` +

    `${tipoMidia.emoji} *${tipoMidia.nome} recebido do cliente:*`;


  const legendaCliente =
    mensagemRecebida ||
    analise.legenda;


  if (
    legendaCliente &&
    messageType ===
      "image"
  ) {
    cabecalho +=
      `\n\n📝 *Legenda:*\n${legendaCliente}`;
  }


  if (
    analise.originalName &&
    (
      messageType === "file" ||
      messageType === "document"
    )
  ) {
    cabecalho +=
      `\n\n📄 *Arquivo:* ${analise.originalName}`;
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
    // Ainda não conseguimos enviar nada.
    // Pode liberar.
    return {
      liberarDedupe: true,

      body: {
        received: true,
        processed: false,

        reason:
          "media_header_error",
      },
    };
  }


  // ========================================
  // 2. MÍDIA
  // ========================================

  const envioMidia =
    await enviarArquivoSimplificado({
      toPhone:
        consultorDestino.telefone,

      fileUrl:
        fonte.tipo === "url"
          ? fonte.valor
          : null,

      fileData:
        fonte.tipo === "base64"
          ? fonte.valor
          : null,

      fileName:
        fonte.fileName,

      contentType:
        fonte.contentType,

      contactName:
        consultorDestino.nome,
    });


  if (!envioMidia.ok) {
    // O cabeçalho já foi enviado.
    //
    // NÃO liberamos o dedupe, porque
    // uma nova execução duplicaria
    // o cabeçalho.
    return {
      body: {
        received: true,
        processed: false,

        reason:
          "media_send_error",
      },
    };
  }


  marcarMidiaProcessadaLocal(
    messageId
  );


  // ========================================
  // 3. ESPERA
  //
  // Cabeçalho
  //     ↓
  // Mídia
  //     ↓
  // 4 segundos
  //     ↓
  // Instrução
  // ========================================

  console.log(
    "⏳ AGUARDANDO MÍDIA ANTES DA INSTRUÇÃO:",
    {
      messageId,

      tipo:
        messageType,

      esperaMs:
        ESPERA_APOS_ENVIO_MIDIA_MS,
    }
  );


  await esperar(
    ESPERA_APOS_ENVIO_MIDIA_MS
  );


  // ========================================
  // 4. INSTRUÇÃO
  // ========================================

  const envioInstrucao =
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
    "✅ FLUXO CLIENTE → CONSULTOR FINALIZADO:",
    {
      messageId,

      cliente:
        telefoneContato,

      consultor:
        consultorDestino.nome,

      tipo:
        messageType,

      origem:
        fonte.origem,

      cabecalho:
        envioCabecalho.ok,

      midia:
        envioMidia.ok,

      instrucao:
        envioInstrucao.ok,

      ordem:
        "cabecalho > midia > instrucao",
    }
  );


  return {
    body: {
      received: true,
      processed: true,

      direction:
        "client_to_consultant_media",

      mediaType:
        messageType,

      consultor:
        consultorDestino.nome,

      ordem:
        "header_media_instruction",
    },
  };
}


// ==========================================
// HANDLER
// ==========================================

export default async function handler(
  req,
  res
) {
  let messageIdClaimed =
    null;


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
      req.method ===
      "GET"
    ) {
      return res
        .status(200)
        .json({
          received: true,

          route:
            "retorno",

          status:
            "online",

          dedupe:
            "supabase",
        });
    }


    if (
      req.method !==
      "POST"
    ) {
      return res
        .status(200)
        .json({
          received: true,
          ignored: true,

          reason:
            "method_not_supported",
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
      }

      catch {
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
          received: true,
          ignored: true,

          reason:
            "not_message_event",
        });
    }


    // ======================================
    // PEGAR O MESSAGE ID
    //
    // ISTO ACONTECE ANTES DE QUALQUER
    // ENVIO DE MENSAGEM.
    // ======================================

    const conteudo =
      body?.Payload?.Content ||
      body?.payload?.content ||
      {};


    const ultimaMensagem =
      conteudo?.LastMessage ||
      conteudo?.lastMessage ||
      {};


    const messageId =
      textoValido(
        ultimaMensagem?.Id ||
        ultimaMensagem?.id
      );


    // ======================================
    // SEM MESSAGE ID
    //
    // Não processamos eventos sem ID porque
    // não conseguiríamos garantir
    // idempotência.
    // ======================================

    if (!messageId) {
      console.warn(
        "⚠️ EVENTO SEM MESSAGE ID IGNORADO"
      );


      return res
        .status(200)
        .json({
          received: true,
          ignored: true,

          reason:
            "missing_message_id",
        });
    }


    // ======================================
    // SUPABASE CLAIM
    //
    // AQUI ESTÁ A TRAVA PRINCIPAL.
    // ======================================

    const claim =
      await assumirWebhook(
        messageId
      );


    // ======================================
    // SE O SUPABASE ESTIVER FORA
    //
    // NÃO processamos.
    //
    // É melhor segurar uma mensagem
    // temporariamente do que voltar a
    // mandar três cópias.
    // ======================================

    if (!claim.ok) {
      return res
        .status(200)
        .json({
          received: true,
          processed: false,

          reason:
            "dedupe_unavailable",
        });
    }


    // ======================================
    // OUTRA EXECUÇÃO JÁ GANHOU
    // ======================================

    if (!claim.claimed) {
      console.log(
        "♻️ WEBHOOK DUPLICADO IGNORADO:",
        {
          messageId,
        }
      );


      return res
        .status(200)
        .json({
          received: true,
          ignored: true,

          duplicate: true,

          messageId,

          reason:
            "duplicate_message",
        });
    }


    // Marcamos que esta execução
    // possui a trava.
    messageIdClaimed =
      messageId;


    // ======================================
    // PROCESSAMENTO NORMAL
    // ======================================

    const resultado =
      await processarMensagem(
        body
      );


    // ======================================
    // LIBERAR PARA UMA NOVA TENTATIVA
    // ======================================

    if (
      resultado
        ?.liberarDedupe ===
      true
    ) {
      await liberarWebhook(
        messageId
      );


      messageIdClaimed =
        null;
    }


    // ======================================
    // CONCLUIR
    // ======================================

    else {
      await concluirWebhook(
        messageId
      );


      messageIdClaimed =
        null;
    }


    return res
      .status(200)
      .json(
        resultado?.body || {
          received: true,
        }
      );


  } catch (error) {

    console.error(
      "❌ ERRO NO RETORNO:",
      error
    );


    // ======================================
    // SE DEU ERRO ANTES DE FINALIZAR,
    // LIBERAMOS A TRAVA.
    // ======================================

    if (messageIdClaimed) {
      try {
        await liberarWebhook(
          messageIdClaimed
        );
      } catch (
        erroRelease
      ) {
        console.error(
          "❌ ERRO AO LIBERAR DEDUPE:",
          erroRelease
        );
      }
    }


    return res
      .status(200)
      .json({
        received: true,
        processed: false,
        error: true,
      });
  }
}
