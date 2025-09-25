const https = require("https");

function postJsonToUrl(fullUrl, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const data = JSON.stringify(bodyObj);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search, // inclut ?sv=...
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
      context.res = { status: 400, body: { step: "validate-email", message: "E-mail invalide" } };
      return;
    }

    const sas = process.env.TABLE_SAS_URL || "";
    if (!sas) {
      context.res = { status: 500, body: { step: "config", message: "TABLE_SAS_URL manquante dans les variables d’environnement." } };
      return;
    }

    // Diagnostics lisibles
    if (!sas.includes("/subscribers")) {
      context.res = { status: 500, body: { step: "config", message: "TABLE_SAS_URL doit contenir /subscribers avant ?sv=...", value: sas.slice(0,120) + "..." } };
      return;
    }
    if (!sas.includes("?sv=")) {
      context.res = { status: 500, body: { step: "config", message: "TABLE_SAS_URL ne contient pas le token SAS (?sv=...)", value: sas.slice(0,120) + "..." } };
      return;
    }

    // Tentative d’insertion
    const entity = {
      PartitionKey: "subscribers",
      RowKey: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      email,
      createdAt: new Date().toISOString()
    };

    let r;
    try {
      r = await postJsonToUrl(sas, entity);
    } catch (e) {
      context.res = { status: 500, body: { step: "https-request", message: "Erreur réseau lors de l’appel Table Storage", error: String(e) } };
      return;
    }

    if (r.status >= 200 && r.status < 300) {
      context.res = { status: 200, body: { message: "Inscription enregistrée." } };
      return;
    }

    // Erreur côté Table Storage : on renvoie le détail pour comprendre
    context.res = {
      status: r.status || 502,
      body: {
        step: "table-insert",
        status: r.status,
        hint:
          r.status === 403 ? "403 = SAS invalide/expirée ou permissions insuffisantes (coche a,c,r ; début -15min ; service Table uniquement)." :
          r.status === 404 ? "404 = URL SAS sans /subscribers OU la table subscribers n’existe pas." :
          "Voir details pour le message complet renvoyé par Table Storage.",
        details: r.text
      }
    };
  } catch (err) {
    context.res = { status: 500, body: { step: "catch", message: "Erreur interne", error: String(err) } };
  }
};
