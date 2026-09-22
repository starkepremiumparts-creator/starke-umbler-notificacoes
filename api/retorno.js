export default async function handler(req, res) {
  try {
    // Segurança básica:
    // a URL precisa trazer o mesmo segredo salvo na Vercel.
    const secret =
      req.query?.secret;

    if (
      !process.env.WEBHOOK_SECRET ||
      secret !== process.env.WEBHOOK_SECRET
    ) {
      // Respondemos 200 para evitar retentativas desnecessárias
      // do webhook da Umbler.
      return res.status(200).json({
        received: true,
        ignored: true
      });
    }

    const body =
      req.body || {};

    // TEMPORÁRIO:
    // serve apenas para descobrirmos a estrutura
    // real enviada pelo webhook da Umbler.
    console.error(
      "WEBHOOK RETORNO RECEBIDO:",
      JSON.stringify(body, null, 2)
    );

    return res.status(200).json({
      received: true
    });

  } catch (error) {
    console.error(
      "ERRO WEBHOOK RETORNO:",
      error
    );

    // Sempre retornar rapidamente ao Umbler.
    return res.status(200).json({
      received: true
    });
  }
}
