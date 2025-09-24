// api/subscribe/index.js
// Écrit une entité dans Azure Table Storage via une URL SAS (aucune dépendance NPM)

const https = require("https");

function postJsonToUrl(fullUrl, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const data = JSON.stringify(bodyObj);

    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search, // inclut le ?sv=...
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json;odata=nometadata",
          "x-ms-version": "2019-02-02",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, text });
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function (context, req) {
  try {
    const email = (req.body && req.body.email || "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      context.res = { status: 400, body: { message: "E-mail invalide" } };
      return;
    }

    // IMPORTANT : mets l’URL SAS complète dans la variable d’environnement TABLE_SAS_URL
    // Format attendu :
    // https://<compte>.table.core.windows.net/<nomTable>?sv=...&ss=t&...
    const tableSasUrl = process.env.TABLE_SAS_URL;
    if (!tableSasUrl) {
      context.res = { status: 500, body: { message: "Config manquante: TABLE_SAS_URL" } };
      return;
    }

    // Entité à insérer
    const entity = {
      PartitionKey: "subscribers",
      RowKey: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      email,
      createdAt: new Date().toISOString()
    };

    // Appel REST vers Table Storage
    const r = await postJsonToUrl(tableSasUrl, entity);

    // Succès attendu : 204 (No Content). Certains environnements renvoient 201/200.
    if (r.status >= 200 && r.status < 300) {
      context.res = { status: 200, body: { message: "Inscription enregistrée." } };
      return;
    }

    // Échec : on renvoie le détail pour t’aider à diagnostiquer
    context.log("Table insert error:", r.status, r.text);
    context.res = {
      status: r.status || 502,
      body: { message: "Enregistrement Table échoué", status: r.status, details: r.text }
    };
  } catch (err) {
    context.log("Function error:", err);
    context.res = { status: 500, body: { message: "Erreur interne", error: String(err) } };
  }
};
