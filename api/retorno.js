// ==========================================
// STÄRKE PARTS
// RETORNO DOS CONSULTORES VIA WHATSAPP
// ==========================================
//
// FORMATO UTILIZADO PELO CONSULTOR:
//
// #5513999999999 Bom dia! Temos a peça disponível.
//
// O sistema:
// 1. identifica quem enviou
// 2. valida se é consultor autorizado
// 3. extrai o telefone depois de #
// 4. extrai a mensagem
// 5. envia pela Central para o cliente
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

  // Se vier somente DDD + número,
  // acrescentamos Brasil (55).
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


// ==========================================
// PEGAR CONSULTORES AUTORIZADOS
// ==========================================

function obterConsultoresAutorizados() {
  const numeros = [
    process.env.CONSULTOR_SANTOS_PHONE,
    process.env.CONSULTOR_CAMPINAS_PHONE,
    process.env.CONSULTOR_SOROCABA_PHONE,
  ];

  // Permite adicionar outros consultores
  // futuramente em uma variável única:
  //
  // RETORNO_CONSULTORES
  //
  // Exemplo:
  // +5511999999999,+5511988888888
  //
  if (process.env.RETORNO_CONSULTORES) {
    const extras =
      process.env.RETORNO_CONSULTORES
        .split(/[,;\n]/);

    numeros.push(...extras);
  }

  return new Set(
    numeros
      .map(normalizarTelefone)
      .filter(Boolean)
  );
}


// ==========================================
// FUNÇÃO PARA ENVIAR PELO UMBLER
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

        body: JSON.stringify({
          toPhone,
          fromPhone,
          organizationId,
          message,
          file: null,
          skipReassign: false,
          contactName:
            contactName || "Contato",
        }),
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
// HANDLER PRINCIPAL
// ==========================================

export default async function handler(
  req,
  res
) {
  try {

    // ==========================================
    // 1. VALIDAR SECRET
    // ==========================================

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


    // ==========================================
    // 2. TESTE PELO NAVEGADOR
    // ==========================================

    if (req.method === "GET") {
      return res.status(200).json({
        received: true,
        route: "retorno",
        status: "online",
      });
    }


    // ==========================================
    // 3. ACEITAR SOMENTE POST
    // ==========================================

    if (req.method !== "POST") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }


    // ==========================================
    // 4. RECEBER JSON DO UMBLER
    // ==========================================

    let body = req.body;

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

    body = body || {};


    // ==========================================
    // 5. ACEITAR SOMENTE EVENTO MESSAGE
    // ==========================================

    const tipoEvento =
      body.Type ||
      body.type;

    if (
      String(tipoEvento).toLowerCase() !==
      "message"
    ) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "not_message_event",
      });
    }


    // ==========================================
    // 6. EXTRAIR ESTRUTURA REAL DO UMBLER
    // ==========================================

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


    // ==========================================
    // 7. TELEFONE DE QUEM ENVIOU
    // ==========================================

    const telefoneRemetente =
      normalizarTelefone(
        contato?.PhoneNumber ||
        contato?.phoneNumber
      );


    // ==========================================
    // 8. TEXTO RECEBIDO
    // ==========================================

    const mensagemRecebida =
      textoValido(
        ultimaMensagem?.Content ||
        ultimaMensagem?.content
      );


    // ==========================================
    // 9. ORIGEM DA MENSAGEM
    // ==========================================

    const source =
      String(
        ultimaMensagem?.Source ||
        ultimaMensagem?.source ||
        ""
      )
        .trim()
        .toLowerCase();


    console.log(
      "RETORNO RECEBIDO:",
      {
        telefoneRemetente,
        source,
        possuiMensagem:
          Boolean(mensagemRecebida),
      }
    );


    // ==========================================
    // 10. IGNORAR MENSAGENS QUE NÃO VÊM
    //     DE CONTATO EXTERNO
    // ==========================================
    //
    // Isso é MUITO importante para evitar loop.
    //
    // Mensagens que nossa própria Central enviar
    // também geram evento no webhook.
    //
    // ==========================================

    if (source !== "contact") {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "not_contact_message",
      });
    }


    // ==========================================
    // 11. VERIFICAR CONSULTOR AUTORIZADO
    // ==========================================

    const consultoresAutorizados =
      obterConsultoresAutorizados();

    if (
      !telefoneRemetente ||
      !consultoresAutorizados.has(
        telefoneRemetente
      )
    ) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "sender_not_authorized",
      });
    }


    // ==========================================
    // 12. IGNORAR MENSAGEM SEM TEXTO
    // ==========================================

    if (!mensagemRecebida) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "empty_message",
      });
    }


    // ==========================================
    // 13. INTERPRETAR COMANDO
    // ==========================================
    //
    // FORMATO:
    //
    // #5513999999999 mensagem
    //
    // ==========================================

    const comando =
      mensagemRecebida.match(
        /^#\s*(\+?\d{10,15})\s+([\s\S]+)$/
      );


    // ==========================================
    // 14. SE CONSULTOR DIGITOU FORMATO ERRADO
    // ==========================================

    if (!comando) {

      await enviarMensagem({
        toPhone:
          telefoneRemetente,

        contactName:
          "Consultor Stärke Parts",

        message:
          "⚠️ Formato de resposta inválido.\n\n" +
          "Para responder um cliente pela Central, envie desta forma:\n\n" +
          "#TELEFONE mensagem\n\n" +
          "Exemplo:\n" +
          "#5513999999999 Bom dia! Temos essa peça disponível.",
      });

      return res.status(200).json({
        received: true,
        processed: false,
        reason:
          "invalid_command_format",
      });
    }


    // ==========================================
    // 15. PEGAR CLIENTE + MENSAGEM
    // ==========================================

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


    // ==========================================
    // 16. ENVIAR RESPOSTA AO CLIENTE
    // ==========================================

    const envioCliente =
      await enviarMensagem({
        toPhone:
          telefoneCliente,

        contactName:
          "Cliente",

        message:
          mensagemCliente,
      });


    // ==========================================
    // 17. ERRO NO ENVIO
    // ==========================================

    if (!envioCliente.ok) {

      console.error(
        "ERRO AO ENCAMINHAR PARA CLIENTE:",
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
          "umbler_send_error",
      });
    }


    // ==========================================
    // 18. CONFIRMAR PARA O CONSULTOR
    // ==========================================

    await enviarMensagem({
      toPhone:
        telefoneRemetente,

      contactName:
        "Consultor Stärke Parts",

      message:
        "✅ Resposta enviada ao cliente pela Central.",
    });


    // ==========================================
    // 19. SUCESSO
    // ==========================================

    console.log(
      "RETORNO ENCAMINHADO COM SUCESSO:",
      {
        consultor:
          telefoneRemetente,

        cliente:
          telefoneCliente,
      }
    );

    return res.status(200).json({
      received: true,
      processed: true,
      success: true,
    });

  } catch (error) {

    console.error(
      "ERRO NO RETORNO:",
      error
    );

    // Sempre responder 200 ao webhook
    // para evitar múltiplas tentativas.
    return res.status(200).json({
      received: true,
      processed: false,
      error: true,
    });
  }
}
