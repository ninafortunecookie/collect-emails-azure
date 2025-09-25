const { TableClient } = require("@azure/data-tables");
const sgMail = require("@sendgrid/mail");

module.exports = async function (context, req) {
  context.log("subscribe function called");

  try {
    const email = (req.body && req.body.email || "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      context.res = { status: 400, body: { message: "E-mail invalide" } };
      return;
    }

    // --- Enregistrer dans Table Storage ---
    const tableUrl = process.env.TABLE_SAS_URL; // doit contenir /subscribers?... 
    const tableClient = new TableClient(tableUrl);

    await tableClient.createEntity({
      partitionKey: "subscribers",
      rowKey: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
      email,
      createdAt: new Date().toISOString(),
    });

    // --- Envoi email avec SendGrid ---
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: email,
      from: process.env.FROM_EMAIL, // ton domaine validé SendGrid
      replyTo: process.env.REPLY_TO,
      subject: "Merci — voici ta réduction",
      html: `<p>Merci ! Voici ton code promo : <strong>CAT10</strong></p>`,
    };

    await sgMail.send(msg);

    context.res = { status: 200, body: { message: "Inscription enregistrée et mail envoyé." } };
  } catch (err) {
    context.log.error("Erreur API :", err);
    context.res = { status: 500, body: { message: "Erreur interne" } };
  }
};
