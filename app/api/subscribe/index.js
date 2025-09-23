// api/subscribe/index.js
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const nodemailer = require("nodemailer");

module.exports = async function (context, req) {
  context.log('subscribe function called');

  try {
    const email = (req.body && req.body.email || '').trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      context.res = { status: 400, body: { message: 'E-mail invalide' } };
      return;
    }

    // --- Enregistrer dans Table Storage (tes variables d'env doivent être définies dans Azure) ---
    // TABLE_ACCOUNT_NAME, TABLE_ACCOUNT_KEY, TABLE_NAME
    const account = process.env.TABLE_ACCOUNT_NAME;
    const key = process.env.TABLE_ACCOUNT_KEY;
    const tableName = process.env.TABLE_NAME || "subscribers";

    if (account && key) {
      const cred = new AzureNamedKeyCredential(account, key);
      const tableClient = new TableClient(
        `https://${account}.table.core.windows.net`,
        tableName,
        cred
      );

      // créer la table si elle n'existe pas (idempotent)
      try { await tableClient.createTable(); } catch (_) { /* déjà créée */ }

      await tableClient.createEntity({
        partitionKey: 'subscribers',
        rowKey: Date.now().toString() + '-' + Math.random().toString(36).slice(2,8),
        email,
        createdAt: new Date().toISOString()
      });
    } else {
      context.log.warn('Storage non configuré (TABLE_ACCOUNT_NAME/KEY manquants).');
    }

    // --- (Optionnel) Envoi d'un e-mail via SMTP si variables définies ---
    // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ('true'/'false'), FROM_EMAIL
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: (process.env.SMTP_SECURE === 'true'), // true pour 465
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      try {
        await transporter.sendMail({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: 'Merci — voici ta réduction',
          html: `<p>Merci ! Voici ton code : <strong>TEST10</strong></p>`
        });
      } catch (err) {
        context.log.error('Erreur SMTP :', err?.message || err);
        // on n'échoue pas la requête si l'envoi échoue
      }
    }

    context.res = { status: 200, body: { message: 'Inscription enregistrée.' } };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { message: 'Erreur interne' } };
  }
};
