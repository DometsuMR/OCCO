exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Usa POST" }) };
  }

  try {
    const { a, b, registro, ganador, motivo, vidaFinal } = JSON.parse(event.body || "{}");
    if (!a || !b || !Array.isArray(registro) || !ganador) {
      return { statusCode: 400, body: JSON.stringify({ error: "Datos incompletos" }) };
    }

    const corte = (s, n) => String(s ?? "").slice(0, n);
    const ficha = (f) =>
      `- ${corte(f.nombre, 40)} (${corte(f.categoria, 40)}). Atributos: ${JSON.stringify(f.stats)}. ` +
      `Habilidades: ${(f.habilidades || []).slice(0, 4).map((x) => corte(x, 30)).join(", ") || "ninguna"}. ` +
      `Descripción: ${corte(f.descripcion, 400)}`;

    const datos = [
      "PERSONAJES:", ficha(a), ficha(b),
      "REGISTRO DEL COMBATE (segundo a segundo):",
      ...registro.slice(0, 30).map((x) => "- " + corte(x, 120)),
      `RESULTADO: gana ${corte(ganador, 40)} ${corte(motivo, 80)}.`,
      `VIDA FINAL: ${JSON.stringify(vidaFinal || {})}`,
    ].join("\n");

    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    console.log("¿Clave detectada en Netlify?:", apiKey ? "SÍ" : "NO");

    if (!apiKey) {
      throw new Error("Falta la clave de API en las variables de entorno de Netlify");
    }

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              "Eres el narrador experto de una arena de combate de personajes originales. " +
              "OBLIGATORIO: Devuelve ÚNICAMENTE la crónica final en ESPAÑOL. " +
              "PROHIBIDO incluir borradores, conteos de palabras, planes de escritura ni razonamientos internos en inglés. " +
              "Escribe directamente una crónica épica de 3 o 4 párrafos respetando estrictamente el resultado, " +
              "los tiempos y la vida final del registro. Separa los párrafos con una línea en blanco.",
          },
          { role: "user", content: datos },
        ],
      }),
    });

    if (!r.ok) {
      const errorBody = await r.text();
      console.error("Error devuelto por Groq:", r.status, errorBody);
      throw new Error("Groq respondió con estado " + r.status);
    }
    
    const j = await r.json();

    // Extraemos EXCLUSIVAMENTE el contenido final de la respuesta, ignorando cualquier razonamiento interno
    let cronica = j.choices?.[0]?.message?.content?.trim();

    if (!cronica) {
      throw new Error("Respuesta vacía de Groq: " + JSON.stringify(j));
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronica }),
    };

  } catch (e) {
    console.error("Error general en la función:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "No se pudo narrar: " + e.message }),
    };
  }
};