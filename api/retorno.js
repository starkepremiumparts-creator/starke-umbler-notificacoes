// ==========================================
// STÄRKE PARTS
// PONTE WHATSAPP CENTRAL ↔ CONSULTORES
// ==========================================
//
// CONSULTOR → CLIENTE:
//
// #5511999999999 Bom dia! Temos a peça.
//
// CLIENTE RECEBE:
//
// *Igor Alves:*
// Bom dia! Temos a peça.
//
// ------------------------------------------
//
// CLIENTE → CONSULTOR:
//
// Cliente responde na Central.
// Sistema verifica a etiqueta do contato.
// Ex.: etiqueta "Igor"
//
// Igor recebe:
//
// 🔔 NOVA MENSAGEM DE CLIENTE
//
// 👤 Cliente: Wilson Dias
// 📱 Telefone: +5511999999999
//
// 💬 Mensagem:
// Texto enviado pelo cliente
//
// ↩️ Para responder diretamente pela Central:
//
// 📋 Copie e responda:
// #5511999999999
//
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
    numero = "55" + numero;
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
    .replace(/[\u0300-\u036f]/g, "");
}


// ==========================================
// CONSULTOR
// ==========================================

function cadastrarConsultor(
  consultores,
  nome,
  telefone,
  etiqueta = null
) {
  const telefoneNormalizado =
    normalizarTelefone(telefone);

  if (!telefoneNormalizado) {
    return;
  }

  const nomeFinal =
    textoValido(nome) ||
    "Consultor Stärke Parts";

  consultores.set(
    telefoneNormalizado,
    {
      nome: nomeFinal,
      telefone: telefoneNormalizado,
      etiqueta:
        textoValido(etiqueta),
    }
  );
}


// ==========================================
// LER RETORNO_CONSULTORES
// ==========================================
//
// Formato:
//
// Igor Alves|+5511991636278|Igor
//
// Também aceita temporariamente:
//
// Igor Alves|+5511991636278
//
// ==========================================

function obterConsultoresAutorizados() {
  const consultores =
    new Map();

  const lista =
    process.env.RETORNO_CONSULTORES || "";

  const linhas =
    lista
      .split(/\r?\n|;/)
      .map((linha) => linha.trim())
      .filter(Boolean);


  for (const linha of linhas) {

    const partes =
      linha
        .split("|")
        .map((parte) => parte.trim());


    if (partes.length >= 2) {

      cadastrarConsultor(
        consultores,
        partes[0],
        partes[1],
        partes[2] || null
      );

      continue;
    }


    cadastrarConsultor(
      consultores,
      "Consultor Stärke Parts",
      partes[0],
      null
    );
  }


  // Compatibilidade com variáveis antigas.

  if (
    process.env.CONSULTOR_SANTOS_PHONE
  ) {
    cadastrarConsultor(
      consultores,
      "Consultor Santos",
      process.env.CONSULTOR_SANTOS_PHONE,
      null
    );
  }


  if (
    process.env.CONSULTOR_CAMPINAS_PHONE
  ) {
    cadastrarConsultor(
      consultores,
      "Consultor Campinas",
      process.env.CONSULTOR_CAMPINAS_PHONE,
      null
    );
  }


  if (
    process.env.CONSULTOR_SOROCABA_PHONE
  ) {
    cadastrarConsultor(
      consultores,
      "Consultor Sorocaba",
      process.env.CONSULTOR_SOROCABA_PHONE,
      null
    );
  }


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
      .map((tag) =>
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
// ENVIAR VIA UMBLER
// ==========================================

async function enviarMensagem({
  toPhone,
  message,
  contactName,
}) {

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
          JSON.stringify(payload),
      }
    );


  const respostaTexto =
    await resposta.text();


  let resultado = null;


  if (respostaTexto) {
    try {
      resultado =
        JSON.parse(respostaTexto);
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
// HANDLER
// ==========================================

export default async function handler(
  req,
  res
) {

  try {

    // ========================================
    // SEGURANÇA
    // ========================================

    const url =
      new URL(
        req.url,
        "https://starke.local"
      );


    const secretRecebido =
      url.searchParams.get("secret");

    const secretCorreto =
      process.env.WEBHOOK_SECRET;


    if (
      !secretCorreto ||
      secretRecebido !== secretCorreto
    ) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "invalid_secret",
      });

    }


    // ========================================
    // TESTE PELO NAVEGADOR
    // ========================================

    if (req.method === "GET") {

      return res.status(200).json({
        received: true,
        route: "retorno",
        status: "online",
      });

    }


    if (req.method !== "POST") {

      return res.status(200).json({
        received: true,
        ignored: true,
      });

    }


    // ========================================
    // RECEBER JSON
    // ========================================

    let body =
      req.body;


    if (typeof body === "string") {

      try {

        body =
          JSON.parse(body);

      } catch {

        return res.status(200).json({
          received: true,
          ignored: true,
          reason: "invalid_json",
        });

      }
    }


    body =
      body || {};


    // ========================================
    // SOMENTE MESSAGE
    // ========================================

    const tipoEvento =
      body.Type ||
      body.type;


    if (
      String(tipoEvento)
        .toLowerCase() !== "message"
    ) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "not_message_event",
      });

    }


    // ========================================
    // PAYLOAD UMBLER
    // ========================================

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


    const isPrivate =
      Boolean(
        ultimaMensagem?.IsPrivate ??
        ultimaMensagem?.isPrivate
      );


    console.log(
      "EVENTO MESSAGE:",
      {
        telefoneContato,
        nomeContato,
        source,
        isPrivate,
        tags:
          Array.isArray(tags)
            ? tags.map(
                (tag) =>
                  tag?.Name ||
                  tag?.name
              )
            : [],
        possuiMensagem:
          Boolean(mensagemRecebida),
      }
    );


    // ========================================
    // IGNORAR NOTAS PRIVADAS
    // ========================================

    if (isPrivate) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "private_message",
      });

    }


    if (
      !telefoneContato ||
      !mensagemRecebida
    ) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "missing_message_data",
      });

    }


    const consultores =
      obterConsultoresAutorizados();


    const consultorRemetente =
      consultores.get(
        telefoneContato
      );


    // ========================================
    // FLUXO 1
    // CONSULTOR → CLIENTE
    // ========================================

    if (
      consultorRemetente &&
      mensagemRecebida.startsWith("#")
    ) {

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

        return res.status(200).json({
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
          "ERRO AO ENVIAR PARA CLIENTE:",
          {
            status:
              envioCliente.status,

            resultado:
              envioCliente.resultado,
          }
        );


        return res.status(200).json({
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

          cliente:
            telefoneCliente,
        }
      );


      return res.status(200).json({
        received: true,
        processed: true,
        direction:
          "consultant_to_client",
      });

    }


    // ========================================
    // SE É CONSULTOR, MAS NÃO É COMANDO,
    // IGNORAR.
    //
    // Isso impede loop das confirmações
    // enviadas pela própria Central.
    // ========================================

    if (consultorRemetente) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "consultant_non_command",
      });

    }


    // ========================================
    // FLUXO 2
    // CLIENTE → CONSULTOR
    // ========================================
    //
    // Mensagens que nós mesmos enviamos ao
    // cliente não devem voltar para o consultor.
    //
    // Por isso só encaminhamos quando Source
    // indica mensagem do contato.
    // ========================================

    if (source !== "contact") {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "not_incoming_contact_message",
      });

    }


    const consultorDestino =
      localizarConsultorPorEtiqueta(
        consultores,
        tags
      );


    // Cliente sem etiqueta de consultor.
    if (!consultorDestino) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "no_consultant_tag",
      });

    }


    const numeroParaComando =
      telefoneContato
        .replace(/\D/g, "");


    const alertaConsultor =
      `🔔 *NOVA MENSAGEM DE CLIENTE*\n\n` +

      `👤 *Cliente:* ${nomeContato}\n` +
      `📱 *Telefone:* ${telefoneContato}\n\n` +

      `💬 *Mensagem do cliente:*\n` +
      `${mensagemRecebida}\n\n` +

      `↩️ *Para responder diretamente pela Central:*\n\n` +

      `📋 *Copie e responda:*\n` +
      `#${numeroParaComando} `;


    const envioConsultor =
      await enviarMensagem({

        toPhone:
          consultorDestino.telefone,

        contactName:
          consultorDestino.nome,

        message:
          alertaConsultor,

      });


    if (!envioConsultor.ok) {

      console.error(
        "ERRO AO NOTIFICAR CONSULTOR:",
        {
          consultor:
            consultorDestino.nome,

          status:
            envioConsultor.status,

          resultado:
            envioConsultor.resultado,
        }
      );


      return res.status(200).json({
        received: true,
        processed: false,
        reason:
          "consultant_notification_error",
      });

    }


    console.log(
      "CLIENTE → CONSULTOR:",
      {
        cliente:
          telefoneContato,

        nomeCliente:
          nomeContato,

        consultor:
          consultorDestino.nome,

        etiqueta:
          consultorDestino.etiqueta,
      }
    );


    return res.status(200).json({
      received: true,
      processed: true,
      direction:
        "client_to_consultant",
      consultor:
        consultorDestino.nome,
    });


  } catch (error) {

    console.error(
      "ERRO NO RETORNO:",
      error
    );


    return res.status(200).json({
      received: true,
      processed: false,
      error: true,
    });

  }
}
