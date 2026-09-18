// ==========================================
// STÄRKE PARTS - NOTIFICAÇÕES UMBLER TALK
// Campinas • Santos • Sorocaba
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

function limitarTexto(texto, limite = 1000) {
  if (!texto) {
    return null;
  }

  if (texto.length <= limite) {
    return texto;
  }

  return texto.slice(0, limite - 3) + "...";
}

export default async function handler(req, res) {
  // ==========================================
  // 1. ACEITAR SOMENTE POST
  // ==========================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
    });
  }

  try {
    // ==========================================
    // 2. SEGURANÇA DO WEBHOOK
    // ==========================================

    const secretRecebido =
      req.headers["x-webhook-secret"];

    const secretCorreto =
      process.env.WEBHOOK_SECRET;

    if (
      !secretCorreto ||
      secretRecebido !== secretCorreto
    ) {
      return res.status(401).json({
        success: false,
        error: "Não autorizado",
      });
    }

    // ==========================================
    // 3. RECEBER DADOS DO CHATBOT
    // ==========================================

    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    body = body || {};

    const nome =
      textoValido(body.nome) ||
      "Cliente";

    const telefone =
      textoValido(body.telefone) ||
      "Telefone não informado";

    const solicitacao =
      limitarTexto(
        textoValido(body.solicitacao),
        1000
      ) ||
      "Solicitação não informada";

    const filial =
  textoValido(body.filial);

const regiao =
  filial === "santos"
    ? "Santos e Região"
    : filial === "campinas"
    ? "Campinas e Região"
    : filial === "sorocaba"
    ? "Sorocaba e Região"
    : "Central";

    // ==========================================
    // 4. VARIÁVEIS DA VERCEL
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
    // 5. DESCOBRIR QUAL CONSULTOR RECEBERÁ
    // ==========================================

    let toPhone = null;

if (filial === "santos") {
  toPhone =
    process.env.CONSULTOR_SANTOS_PHONE;

} else if (filial === "campinas") {
  toPhone =
    process.env.CONSULTOR_CAMPINAS_PHONE;

} else if (filial === "sorocaba") {
  toPhone =
    process.env.CONSULTOR_SOROCABA_PHONE;
}

    if (!toPhone) {
      return res.status(400).json({
        success: false,
        error:
          `Nenhum consultor configurado para ${regiao}`,
      });
    }

    // ==========================================
    // 6. MONTAR A MENSAGEM
    // ==========================================

    const mensagemAviso =
      `🔔 NOVO CONTATO NA CENTRAL — ${regiao.toUpperCase()}\n\n` +

      `👤 Cliente: ${nome}\n` +
      `📱 Telefone: ${telefone}\n\n` +

      `💬 Solicitação do cliente:\n` +
      `${solicitacao}\n\n` +

      `📍 Região selecionada: ${regiao}\n\n` +

      `Por favor, entre em contato com o cliente para iniciar o atendimento.`;

    // ==========================================
    // 7. ENVIAR A MENSAGEM PELO UMBLER
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

    const respostaTexto =
      await respostaEnvio.text();

    let resultadoEnvio = null;

    if (respostaTexto) {
      try {
        resultadoEnvio =
          JSON.parse(respostaTexto);
      } catch {
        resultadoEnvio =
          respostaTexto;
      }
    }

    // ==========================================
    // 8. TRATAR ERRO DE ENVIO
    // ==========================================

    if (!respostaEnvio.ok) {
      console.error(
        "Erro ao enviar notificação:",
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
      solicitacaoRecebida: true,
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
