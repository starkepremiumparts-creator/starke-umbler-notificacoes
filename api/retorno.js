// ==========================================
// STÄRKE PARTS
// RETORNO DOS CONSULTORES VIA WHATSAPP
// ==========================================
//
// CONSULTOR ENVIA:
//
// #5511999999999 Bom dia! Temos a peça disponível.
//
// CLIENTE RECEBE:
//
// *Igor Alves:*
// Bom dia! Temos a peça disponível.
//
// ==========================================


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

  // Caso venha apenas DDD + telefone,
  // adiciona o código do Brasil.
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
// CADASTRAR CONSULTOR NO MAP
// ==========================================

function cadastrarConsultor(
  consultores,
  nome,
  telefone
) {
  const telefoneNormalizado =
    normalizarTelefone(telefone);

  if (!telefoneNormalizado) {
    return;
  }

  const nomeFinal =
    textoValido(nome) ||
    "Consultor Stärke Parts";

  // Não sobrescreve um cadastro que já exista.
  if (!consultores.has(telefoneNormalizado)) {
    consultores.set(
      telefoneNormalizado,
      {
        nome: nomeFinal,
        telefone: telefoneNormalizado,
      }
    );
  }
}


// ==========================================
// CONSULTOR → NOME + TELEFONE
// ==========================================
//
// RETORNO_CONSULTORES aceita:
//
// Igor Alves|+5511991636278
// William Dias|+5511999999999
//
// Também aceita temporariamente:
//
// +5511888888888
//
// ==========================================

function obterConsultoresAutorizados() {
  const consultores =
    new Map();

  const lista =
    process.env.RETORNO_CONSULTORES || "";

  const linhas =
    lista
      .split(/\r?\n|;|,/)
      .map((linha) => linha.trim())
      .filter(Boolean);

  for (const linha of linhas) {

    const separador =
      linha.indexOf("|");

    // NOVO FORMATO:
    // Nome|Telefone
    if (separador !== -1) {

      const nome =
        linha
          .slice(0, separador)
          .trim();

      const telefone =
        linha
          .slice(separador + 1)
          .trim();

      cadastrarConsultor(
        consultores,
        nome,
        telefone
      );

      continue;
    }

    // FORMATO ANTIGO:
    // somente telefone
    cadastrarConsultor(
      consultores,
      "Consultor Stärke Parts",
      linha
    );
  }


  // ==========================================
  // MANTER COMPATIBILIDADE COM AS FILIAIS
  // ==========================================

  cadastrarConsultor(
    consultores,
    "Consultor Santos",
    process.env.CONSULTOR_SANTOS_PHONE
  );

  cadastrarConsultor(
    consultores,
    "Consultor Campinas",
    process.env.CONSULTOR_CAMPINAS_PHONE
  );

  cadastrarConsultor(
    consultores,
    "Consultor Sorocaba",
    process.env.CONSULTOR_SOROCABA_PHONE
  );

  return consultores;
}


// ==========================================
// ENVIAR MENSAGEM PELO UMBLER
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
// HANDLER PRINCIPAL
// ==========================================

export default async function handler(
  req,
  res
) {

  try {

    // ==========================================
    // 1. SEGURANÇA DO WEBHOOK
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
    // 3. SOMENTE POST
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


    // ==========================================
    // 5. SOMENTE EVENTO MESSAGE
    // ==========================================

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


    // ==========================================
    // 6. ESTRUTURA REAL DO UMBLER
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
    // 7. IDENTIFICAR QUEM ENVIOU
    // ==========================================

    const telefoneRemetente =
      normalizarTelefone(
        contato?.PhoneNumber ||
        contato?.phoneNumber
      );


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
    // 8. ORIGENS ACEITAS
    // ==========================================
    //
    // Nos testes reais vimos:
    //
    // contact
    // member
    //
    // ==========================================

    const origemPermitida =
      source === "contact" ||
      source === "member";


    if (!origemPermitida) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "source_not_allowed",
      });

    }


    // ==========================================
    // 9. VALIDAR CONSULTOR
    // ==========================================

    const consultoresAutorizados =
      obterConsultoresAutorizados();


    const consultor =
      telefoneRemetente
        ? consultoresAutorizados.get(
            telefoneRemetente
          )
        : null;


    if (!consultor) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "sender_not_authorized",
      });

    }


    // ==========================================
    // 10. IGNORAR MENSAGEM VAZIA
    // ==========================================

    if (!mensagemRecebida) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason: "empty_message",
      });

    }


    // ==========================================
    // 11. EVITAR LOOP
    // ==========================================
    //
    // Só comandos iniciados por # serão
    // processados.
    //
    // ==========================================

    if (
      !mensagemRecebida.startsWith("#")
    ) {

      return res.status(200).json({
        received: true,
        ignored: true,
        reason:
          "not_return_command",
      });

    }


    // ==========================================
    // 12. INTERPRETAR COMANDO
    // ==========================================
    //
    // #5511999999999 mensagem
    //
    // ==========================================

    const comando =
      mensagemRecebida.match(
        /^#\s*(\+?\d{10,15})\s+([\s\S]+)$/
      );


    // ==========================================
    // 13. FORMATO ERRADO
    // ==========================================

    if (!comando) {

      await enviarMensagem({

        toPhone:
          telefoneRemetente,

        contactName:
          consultor.nome,

        message:
          `⚠️ ${consultor.nome}, formato de resposta inválido.\n\n` +

          `Para responder um cliente pela Central, envie:\n\n` +

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


    // ==========================================
    // 14. CLIENTE + MENSAGEM
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
    // 15. MONTAR MENSAGEM FINAL DO CLIENTE
    // ==========================================

    const mensagemFinalCliente =
      `*${consultor.nome}:*\n` +
      `${mensagemCliente}`;


    // ==========================================
    // 16. ENVIAR PARA O CLIENTE
    // ==========================================

    const envioCliente =
      await enviarMensagem({

        toPhone:
          telefoneCliente,

        message:
          mensagemFinalCliente,

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
        consultor.nome,

      message:
        `✅ Resposta enviada ao cliente pela Central.\n\n` +
        `👤 Consultor: ${consultor.nome}\n` +
        `📱 Cliente: ${telefoneCliente}`,

    });


    // ==========================================
    // 19. SUCESSO
    // ==========================================

    console.log(
      "RETORNO ENCAMINHADO COM SUCESSO:",
      {
        consultor:
          consultor.nome,

        telefoneConsultor:
          telefoneRemetente,

        cliente:
          telefoneCliente,
      }
    );


    return res.status(200).json({
      received: true,
      processed: true,
      success: true,
      consultor:
        consultor.nome,
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
